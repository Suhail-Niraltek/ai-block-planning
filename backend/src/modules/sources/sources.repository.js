import { randomUUID } from 'node:crypto';
import { pool, query, queryOne } from '../../database/connection.js';

const NOW = 'UTC_TIMESTAMP(3)';

const SOURCE_COLUMNS = `
  id, code, name, adapter_type AS adapterType,
  last_sync_at AS lastSyncAt, last_sync_status AS lastSyncStatus,
  record_count AS recordCount, created_at AS createdAt, updated_at AS updatedAt
`;

const SYNC_RUN_COLUMNS = `
  r.id, r.source_system_id AS sourceSystemId, s.code AS sourceCode, s.name AS sourceName,
  r.started_at AS startedAt, r.completed_at AS completedAt, r.status,
  r.received_count AS receivedCount, r.accepted_count AS acceptedCount,
  r.rejected_count AS rejectedCount, r.error_message AS errorMessage,
  r.created_at AS createdAt
`;

export function findAllSourceSystems() {
  return query(`SELECT ${SOURCE_COLUMNS} FROM source_systems ORDER BY code ASC`);
}

export function findSourceSystemByCode(code) {
  return queryOne(`SELECT ${SOURCE_COLUMNS} FROM source_systems WHERE code = ?`, [code]);
}

/** Registers a source system, or refreshes its descriptive fields if present. */
export async function upsertSourceSystem(connection, { code, name, adapterType }) {
  await connection.execute(
    `INSERT INTO source_systems (id, code, name, adapter_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ${NOW}, ${NOW})
     ON DUPLICATE KEY UPDATE name = VALUES(name), adapter_type = VALUES(adapter_type),
                             updated_at = ${NOW}`,
    [randomUUID(), code, name, adapterType],
  );

  const [rows] = await connection.execute('SELECT id FROM source_systems WHERE code = ?', [code]);
  return rows[0].id;
}

export async function createSyncRun(sourceSystemId) {
  const id = randomUUID();

  await pool.execute(
    `INSERT INTO sync_runs (id, source_system_id, started_at, status, created_at)
     VALUES (?, ?, ${NOW}, 'RUNNING', ${NOW})`,
    [id, sourceSystemId],
  );

  await pool.execute(
    `UPDATE source_systems SET last_sync_status = 'RUNNING', updated_at = ${NOW} WHERE id = ?`,
    [sourceSystemId],
  );

  return id;
}

export async function completeSyncRun(runId, { received, accepted, rejected }) {
  await pool.execute(
    `UPDATE sync_runs
     SET completed_at = ${NOW}, status = 'COMPLETED',
         received_count = ?, accepted_count = ?, rejected_count = ?
     WHERE id = ?`,
    [received, accepted, rejected, runId],
  );
}

export async function failSyncRun(runId, message) {
  await pool.execute(
    `UPDATE sync_runs SET completed_at = ${NOW}, status = 'FAILED', error_message = ? WHERE id = ?`,
    [String(message).slice(0, 2000), runId],
  );
}

export async function updateSourceAfterSync(sourceSystemId, { status, recordCount }) {
  await pool.execute(
    `UPDATE source_systems
     SET last_sync_at = ${NOW}, last_sync_status = ?, record_count = ?, updated_at = ${NOW}
     WHERE id = ?`,
    [status, recordCount, sourceSystemId],
  );
}

export function findSyncRuns(limit = 50) {
  // LIMIT cannot be a placeholder in a prepared statement, so it is coerced.
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200);

  return query(
    `SELECT ${SYNC_RUN_COLUMNS}
     FROM sync_runs r
     JOIN source_systems s ON s.id = r.source_system_id
     ORDER BY r.started_at DESC
     LIMIT ${safeLimit}`,
  );
}

export function findSyncRunById(id) {
  return queryOne(
    `SELECT ${SYNC_RUN_COLUMNS}
     FROM sync_runs r
     JOIN source_systems s ON s.id = r.source_system_id
     WHERE r.id = ?`,
    [id],
  );
}

/** Section code to id lookup, used by every adapter to resolve external codes. */
export async function loadSectionIndex() {
  const rows = await query(
    `SELECT s.id, s.code, s.corridor_id AS corridorId, c.code AS corridorCode
     FROM sections s JOIN corridors c ON c.id = s.corridor_id`,
  );

  return new Map(rows.map((row) => [row.code, row]));
}

export async function loadCorridorIndex() {
  const rows = await query('SELECT id, code FROM corridors');
  return new Map(rows.map((row) => [row.code, row]));
}

export async function upsertAsset(connection, sourceSystemId, record, sectionId, department) {
  await connection.execute(
    `INSERT INTO assets (id, source_system_id, external_id, section_id, department, asset_type,
                         asset_code, name, km_from, km_to, criticality, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ${NOW}, ${NOW})
     ON DUPLICATE KEY UPDATE section_id = VALUES(section_id), asset_type = VALUES(asset_type),
                             name = VALUES(name), km_from = VALUES(km_from), km_to = VALUES(km_to),
                             criticality = VALUES(criticality), updated_at = ${NOW}`,
    [
      randomUUID(),
      sourceSystemId,
      record.assetCode,
      sectionId,
      department,
      record.assetType,
      record.assetCode,
      record.assetName,
      record.kmFrom ?? null,
      record.kmTo ?? null,
      record.criticality,
    ],
  );

  const [rows] = await connection.execute(
    'SELECT id FROM assets WHERE source_system_id = ? AND external_id = ?',
    [sourceSystemId, record.assetCode],
  );

  return rows[0].id;
}

export async function upsertDefect(connection, sourceSystemId, record, assetId, toMysql) {
  if (!record.defectType) {
    return null;
  }

  const externalId = `${record.externalId}-DEF`;

  await connection.execute(
    `INSERT INTO defects (id, source_system_id, external_id, asset_id, defect_type, severity,
                          detected_at, due_at, safety_critical, speed_restriction_kmph,
                          description, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ${NOW}, ${NOW})
     ON DUPLICATE KEY UPDATE defect_type = VALUES(defect_type), severity = VALUES(severity),
                             detected_at = VALUES(detected_at), due_at = VALUES(due_at),
                             safety_critical = VALUES(safety_critical),
                             speed_restriction_kmph = VALUES(speed_restriction_kmph),
                             updated_at = ${NOW}`,
    [
      randomUUID(),
      sourceSystemId,
      externalId,
      assetId,
      record.defectType,
      record.severity,
      toMysql(record.detectedAt),
      toMysql(record.dueAt),
      record.safetyCritical ? 1 : 0,
      record.speedRestrictionKmph ?? null,
      record.title,
    ],
  );

  const [rows] = await connection.execute(
    'SELECT id FROM defects WHERE source_system_id = ? AND external_id = ?',
    [sourceSystemId, externalId],
  );

  return rows[0].id;
}

export async function upsertMaintenanceTask(connection, context) {
  const { sourceSystemId, record, assetId, defectId, sectionId, department, daysOverdue, toMysql } =
    context;

  await connection.execute(
    `INSERT INTO maintenance_tasks (
       id, source_system_id, external_id, defect_id, asset_id, section_id, department,
       task_type, title, earliest_start, due_at, requested_duration_minutes,
       requires_line_block, requires_power_block, requires_disconnection,
       severity, criticality, safety_critical, speed_restriction_kmph,
       days_overdue, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'READY', ${NOW}, ${NOW})
     ON DUPLICATE KEY UPDATE defect_id = VALUES(defect_id), asset_id = VALUES(asset_id),
                             section_id = VALUES(section_id), task_type = VALUES(task_type),
                             title = VALUES(title), earliest_start = VALUES(earliest_start),
                             due_at = VALUES(due_at),
                             requested_duration_minutes = VALUES(requested_duration_minutes),
                             requires_line_block = VALUES(requires_line_block),
                             requires_power_block = VALUES(requires_power_block),
                             requires_disconnection = VALUES(requires_disconnection),
                             severity = VALUES(severity), criticality = VALUES(criticality),
                             safety_critical = VALUES(safety_critical),
                             speed_restriction_kmph = VALUES(speed_restriction_kmph),
                             days_overdue = VALUES(days_overdue), updated_at = ${NOW}`,
    [
      randomUUID(),
      sourceSystemId,
      record.externalId,
      defectId,
      assetId,
      sectionId,
      department,
      record.taskType,
      record.title,
      toMysql(record.detectedAt),
      toMysql(record.dueAt),
      record.requestedDurationMinutes,
      record.requiresLineBlock ? 1 : 0,
      record.requiresPowerBlock ? 1 : 0,
      record.requiresDisconnection ? 1 : 0,
      record.severity,
      record.criticality,
      record.safetyCritical ? 1 : 0,
      record.speedRestrictionKmph ?? null,
      daysOverdue,
    ],
  );
}

export async function upsertBlockWindow(connection, sourceSystemId, record, ids, toMysql) {
  await connection.execute(
    `INSERT INTO block_windows (id, source_system_id, external_id, corridor_id, section_id,
                                starts_at, ends_at, available_line_count,
                                power_isolation_available, signalling_disconnection_available,
                                confidence, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${NOW}, ${NOW})
     ON DUPLICATE KEY UPDATE corridor_id = VALUES(corridor_id), section_id = VALUES(section_id),
                             starts_at = VALUES(starts_at), ends_at = VALUES(ends_at),
                             available_line_count = VALUES(available_line_count),
                             power_isolation_available = VALUES(power_isolation_available),
                             signalling_disconnection_available =
                               VALUES(signalling_disconnection_available),
                             confidence = VALUES(confidence), status = VALUES(status),
                             updated_at = ${NOW}`,
    [
      randomUUID(),
      sourceSystemId,
      record.externalId,
      ids.corridorId,
      ids.sectionId,
      toMysql(record.startsAt),
      toMysql(record.endsAt),
      record.availableLineCount,
      record.powerIsolationAvailable ? 1 : 0,
      record.signallingDisconnectionAvailable ? 1 : 0,
      record.confidence,
      record.status,
    ],
  );
}

export async function upsertTrainMovement(connection, sourceSystemId, record, sectionId, toMysql) {
  await connection.execute(
    `INSERT INTO train_movements (id, source_system_id, external_id, train_number, train_type,
                                  priority_class, section_id, entry_at, exit_at, protected,
                                  source_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${NOW})
     ON DUPLICATE KEY UPDATE train_number = VALUES(train_number), train_type = VALUES(train_type),
                             priority_class = VALUES(priority_class), section_id = VALUES(section_id),
                             entry_at = VALUES(entry_at), exit_at = VALUES(exit_at),
                             protected = VALUES(protected), source_type = VALUES(source_type)`,
    [
      randomUUID(),
      sourceSystemId,
      record.externalId,
      record.trainNumber,
      record.trainType,
      record.priorityClass,
      sectionId,
      toMysql(record.entryAt),
      toMysql(record.exitAt),
      record.protected ? 1 : 0,
      record.sourceType,
    ],
  );
}

export async function upsertGoodsForecast(connection, sourceSystemId, record, corridorId, toMysql) {
  await connection.execute(
    `INSERT INTO goods_forecasts (id, source_system_id, external_id, corridor_id, bucket_start,
                                  bucket_end, expected_train_count, lower_count, upper_count,
                                  source_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${NOW})
     ON DUPLICATE KEY UPDATE corridor_id = VALUES(corridor_id), bucket_start = VALUES(bucket_start),
                             bucket_end = VALUES(bucket_end),
                             expected_train_count = VALUES(expected_train_count),
                             lower_count = VALUES(lower_count), upper_count = VALUES(upper_count),
                             source_type = VALUES(source_type)`,
    [
      randomUUID(),
      sourceSystemId,
      record.externalId,
      corridorId,
      toMysql(record.bucketStart),
      toMysql(record.bucketEnd),
      record.expectedTrainCount,
      record.lowerCount,
      record.upperCount,
      record.sourceType,
    ],
  );
}

const COUNT_TABLE_BY_KIND = {
  MAINTENANCE: 'maintenance_tasks',
  BLOCK_WINDOWS: 'block_windows',
  TRAIN_MOVEMENTS: 'train_movements',
  GOODS_FORECASTS: 'goods_forecasts',
};

export async function countRecordsForSource(sourceSystemId, kind) {
  const table = COUNT_TABLE_BY_KIND[kind];

  if (!table) {
    return 0;
  }

  // The table name comes from a fixed internal map, never from user input.
  const row = await queryOne(
    `SELECT COUNT(*) AS total FROM ${table} WHERE source_system_id = ?`,
    [sourceSystemId],
  );

  return Number(row?.total ?? 0);
}
