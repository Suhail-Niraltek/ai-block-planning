import { env } from '../../config/env.js';
import { pool, query, withTransaction } from '../../database/connection.js';
import { ApiError } from '../../middleware/api-response.js';
import { coaAdapter } from './adapters/coa.adapter.js';
import { planningEpoch, toMysqlDateTime } from './adapters/deterministic.js';
import { goodsForecastAdapter } from './adapters/goods-forecast.adapter.js';
import { smmsAdapter } from './adapters/smms.adapter.js';
import { tdmsAdapter } from './adapters/tdms.adapter.js';
import { timetableAdapter } from './adapters/timetable.adapter.js';
import { tmsAdapter } from './adapters/tms.adapter.js';
import * as repository from './sources.repository.js';
import { SCHEMA_BY_KIND } from './sources.validation.js';

/** The six required inputs, in the order the dashboard shows them. */
export const ADAPTERS = [
  tmsAdapter,
  smmsAdapter,
  tdmsAdapter,
  coaAdapter,
  timetableAdapter,
  goodsForecastAdapter,
];

const ADAPTER_BY_CODE = new Map(ADAPTERS.map((adapter) => [adapter.code, adapter]));

/** Ensures every required source system exists as a row. Called by the seeder. */
export async function registerSourceSystems() {
  return withTransaction(async (connection) => {
    const ids = new Map();

    for (const adapter of ADAPTERS) {
      const id = await repository.upsertSourceSystem(connection, {
        code: adapter.code,
        name: adapter.name,
        adapterType: adapter.adapterType,
      });

      ids.set(adapter.code, id);
    }

    return ids;
  });
}

export async function listSources() {
  const rows = await repository.findAllSourceSystems();

  return rows.map((row) => {
    const adapter = ADAPTER_BY_CODE.get(row.code);

    return {
      ...row,
      department: adapter?.department ?? null,
      kind: adapter?.kind ?? null,
      synthetic: true,
    };
  });
}

export function listSyncRuns(limit) {
  return repository.findSyncRuns(limit);
}

export async function getSyncRun(id) {
  const run = await repository.findSyncRunById(id);

  if (!run) {
    throw ApiError.notFound(`Sync run ${id} not found`);
  }

  return run;
}

function daysOverdueFrom(dueAtIso, nowMs) {
  const diffMs = nowMs - Date.parse(dueAtIso);
  return diffMs <= 0 ? 0 : Math.floor(diffMs / 86_400_000);
}

/**
 * Recomputes how many times each asset has produced a defect. The priority
 * engine uses this as its repeat-defect factor.
 */
async function refreshRepeatCounts() {
  await pool.query(`
    UPDATE maintenance_tasks t
    JOIN (
      SELECT asset_id, COUNT(*) AS defect_count
      FROM defects
      GROUP BY asset_id
    ) d ON d.asset_id = t.asset_id
    SET t.repeat_count = LEAST(GREATEST(d.defect_count - 1, 0), 255)
  `);
}

async function persistMaintenance(adapter, sourceSystemId, records, sectionIndex, nowMs) {
  let accepted = 0;
  const rejected = [];

  await withTransaction(async (connection) => {
    for (const record of records) {
      const section = sectionIndex.get(record.sectionCode);

      if (!section) {
        rejected.push({ externalId: record.externalId, reason: `Unknown section ${record.sectionCode}` });
        continue;
      }

      const assetId = await repository.upsertAsset(
        connection,
        sourceSystemId,
        record,
        section.id,
        adapter.department,
      );

      const defectId = await repository.upsertDefect(
        connection,
        sourceSystemId,
        record,
        assetId,
        toMysqlDateTime,
      );

      await repository.upsertMaintenanceTask(connection, {
        sourceSystemId,
        record,
        assetId,
        defectId,
        sectionId: section.id,
        department: adapter.department,
        daysOverdue: daysOverdueFrom(record.dueAt, nowMs),
        toMysql: toMysqlDateTime,
      });

      accepted += 1;
    }
  });

  await refreshRepeatCounts();

  return { accepted, rejected };
}

async function persistBlockWindows(sourceSystemId, records, sectionIndex, corridorIndex) {
  let accepted = 0;
  const rejected = [];

  await withTransaction(async (connection) => {
    for (const record of records) {
      const section = sectionIndex.get(record.sectionCode);
      const corridor = corridorIndex.get(record.corridorCode);

      if (!section || !corridor) {
        rejected.push({
          externalId: record.externalId,
          reason: `Unknown section ${record.sectionCode} or corridor ${record.corridorCode}`,
        });
        continue;
      }

      await repository.upsertBlockWindow(
        connection,
        sourceSystemId,
        record,
        { sectionId: section.id, corridorId: corridor.id },
        toMysqlDateTime,
      );

      accepted += 1;
    }
  });

  return { accepted, rejected };
}

async function persistTrainMovements(sourceSystemId, records, sectionIndex) {
  let accepted = 0;
  const rejected = [];

  await withTransaction(async (connection) => {
    for (const record of records) {
      const section = sectionIndex.get(record.sectionCode);

      if (!section) {
        rejected.push({ externalId: record.externalId, reason: `Unknown section ${record.sectionCode}` });
        continue;
      }

      await repository.upsertTrainMovement(
        connection,
        sourceSystemId,
        record,
        section.id,
        toMysqlDateTime,
      );

      accepted += 1;
    }
  });

  return { accepted, rejected };
}

async function persistGoodsForecasts(sourceSystemId, records, corridorIndex) {
  let accepted = 0;
  const rejected = [];

  await withTransaction(async (connection) => {
    for (const record of records) {
      const corridor = corridorIndex.get(record.corridorCode);

      if (!corridor) {
        rejected.push({
          externalId: record.externalId,
          reason: `Unknown corridor ${record.corridorCode}`,
        });
        continue;
      }

      await repository.upsertGoodsForecast(
        connection,
        sourceSystemId,
        record,
        corridor.id,
        toMysqlDateTime,
      );

      accepted += 1;
    }
  });

  return { accepted, rejected };
}

/**
 * Runs one adapter end to end: generate, validate, upsert, and record the run.
 * Re-running a sync is idempotent because every write is keyed on
 * (source_system_id, external_id).
 */
export async function syncSource(code) {
  const adapter = ADAPTER_BY_CODE.get(code);

  if (!adapter) {
    throw ApiError.notFound(`Unknown source system ${code}`);
  }

  const source = await repository.findSourceSystemByCode(code);

  if (!source) {
    throw ApiError.notFound(
      `Source system ${code} is not registered. Run "npm run seed" to create it.`,
    );
  }

  const runId = await repository.createSyncRun(source.id);

  try {
    const sectionIndex = await repository.loadSectionIndex();
    const corridorIndex = await repository.loadCorridorIndex();

    if (sectionIndex.size === 0) {
      throw ApiError.conflict('No sections are seeded. Run "npm run seed" first.');
    }

    const sections = await query(
      `SELECT s.id, s.code, s.line_type AS lineType, s.electrified,
              s.start_km AS startKm, s.end_km AS endKm, c.code AS corridorCode
       FROM sections s JOIN corridors c ON c.id = s.corridor_id
       WHERE s.active = 1
       ORDER BY c.code ASC, s.sequence_number ASC`,
    );

    const corridors = await query(
      'SELECT id, code, importance_score AS importanceScore FROM corridors WHERE active = 1 ORDER BY code ASC',
    );

    const epochMs = planningEpoch();
    const nowMs = Date.now();

    const rawRecords = adapter.generate({
      sections,
      corridors,
      epochMs,
      seed: env.planning.demoSeed,
    });

    const schema = SCHEMA_BY_KIND[adapter.kind];
    const valid = [];
    const invalid = [];

    for (const raw of rawRecords) {
      const result = schema.safeParse(raw);

      if (result.success) {
        valid.push(result.data);
      } else {
        invalid.push({
          externalId: raw?.externalId ?? '(unknown)',
          reason: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
        });
      }
    }

    let outcome;

    switch (adapter.kind) {
      case 'MAINTENANCE':
        outcome = await persistMaintenance(adapter, source.id, valid, sectionIndex, nowMs);
        break;
      case 'BLOCK_WINDOWS':
        outcome = await persistBlockWindows(source.id, valid, sectionIndex, corridorIndex);
        break;
      case 'TRAIN_MOVEMENTS':
        outcome = await persistTrainMovements(source.id, valid, sectionIndex);
        break;
      case 'GOODS_FORECASTS':
        outcome = await persistGoodsForecasts(source.id, valid, corridorIndex);
        break;
      default:
        throw new Error(`Adapter ${code} has an unsupported kind ${adapter.kind}`);
    }

    const rejectedDetails = [...invalid, ...outcome.rejected];
    const recordCount = await repository.countRecordsForSource(source.id, adapter.kind);

    await repository.completeSyncRun(runId, {
      received: rawRecords.length,
      accepted: outcome.accepted,
      rejected: rejectedDetails.length,
    });

    await repository.updateSourceAfterSync(source.id, { status: 'COMPLETED', recordCount });

    return {
      syncRunId: runId,
      sourceCode: code,
      sourceName: adapter.name,
      kind: adapter.kind,
      receivedCount: rawRecords.length,
      acceptedCount: outcome.accepted,
      rejectedCount: rejectedDetails.length,
      // Capped so a bad fixture cannot flood the response.
      rejectedSample: rejectedDetails.slice(0, 10),
      recordCount,
      synthetic: true,
    };
  } catch (error) {
    await repository.failSyncRun(runId, error.message);
    await repository.updateSourceAfterSync(source.id, {
      status: 'FAILED',
      recordCount: 0,
    });
    throw error;
  }
}

/** Syncs all six sources in dependency order (maintenance before operations). */
export async function syncAllSources() {
  const results = [];

  for (const adapter of ADAPTERS) {
    results.push(await syncSource(adapter.code));
  }

  return results;
}
