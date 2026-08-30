import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { closePool, withTransaction } from './connection.js';
import {
  chance,
  createRandom,
  deriveSeed,
  intBetween,
  pick,
} from '../modules/sources/adapters/deterministic.js';
import { registerSourceSystems } from '../modules/sources/sources.service.js';
import { runMigrations } from './migrate.js';

const NOW = 'UTC_TIMESTAMP(3)';

const CORRIDORS = [
  {
    code: 'COR-A',
    name: 'Northern trunk corridor',
    description:
      'High-density electrified trunk route carrying premium passenger services and through freight.',
    importanceScore: 5,
    sections: [
      { code: 'SEC-A-01', name: 'Ambala Cantt - Barog', startKm: 10.0, endKm: 24.5, lineType: 'DOUBLE', electrified: true },
      { code: 'SEC-A-02', name: 'Barog - Chandail', startKm: 24.5, endKm: 41.2, lineType: 'DOUBLE', electrified: true },
      { code: 'SEC-A-03', name: 'Chandail - Dhanera', startKm: 41.2, endKm: 58.9, lineType: 'DOUBLE', electrified: true },
      { code: 'SEC-A-04', name: 'Dhanera - Etawah Road', startKm: 58.9, endKm: 76.4, lineType: 'MULTIPLE', electrified: true },
      { code: 'SEC-A-05', name: 'Etawah Road - Firozpur Jn', startKm: 76.4, endKm: 92.0, lineType: 'DOUBLE', electrified: true },
    ],
  },
  {
    code: 'COR-B',
    name: 'Eastern feeder corridor',
    description:
      'Mixed traffic feeder route with one single-line section and one non-electrified section.',
    importanceScore: 3,
    sections: [
      { code: 'SEC-B-01', name: 'Gomoh - Hatia Road', startKm: 5.0, endKm: 19.8, lineType: 'DOUBLE', electrified: true },
      { code: 'SEC-B-02', name: 'Hatia Road - Itki', startKm: 19.8, endKm: 33.6, lineType: 'SINGLE', electrified: true },
      { code: 'SEC-B-03', name: 'Itki - Jonha', startKm: 33.6, endKm: 47.1, lineType: 'DOUBLE', electrified: true },
      { code: 'SEC-B-04', name: 'Jonha - Kandra', startKm: 47.1, endKm: 61.5, lineType: 'DOUBLE', electrified: true },
      { code: 'SEC-B-05', name: 'Kandra - Lodhma', startKm: 61.5, endKm: 74.2, lineType: 'DOUBLE', electrified: false },
    ],
  },
  {
    code: 'COR-C',
    name: 'Western freight corridor',
    description:
      'Heavy-haul freight route with quadruple-line sections and sustained goods traffic.',
    importanceScore: 4,
    sections: [
      { code: 'SEC-C-01', name: 'Makarpura - Nadiad', startKm: 2.0, endKm: 18.4, lineType: 'MULTIPLE', electrified: true },
      { code: 'SEC-C-02', name: 'Nadiad - Ognaj', startKm: 18.4, endKm: 35.7, lineType: 'MULTIPLE', electrified: true },
      { code: 'SEC-C-03', name: 'Ognaj - Palanpur Road', startKm: 35.7, endKm: 52.3, lineType: 'DOUBLE', electrified: true },
      { code: 'SEC-C-04', name: 'Palanpur Road - Rajula Jn', startKm: 52.3, endKm: 70.9, lineType: 'DOUBLE', electrified: true },
    ],
  },
  {
    code: 'COR-D',
    name: 'Southern suburban corridor',
    description:
      'Dense suburban route with short headways, so usable maintenance windows are narrow.',
    importanceScore: 5,
    sections: [
      { code: 'SEC-D-01', name: 'Salem Town - Tiruchengode', startKm: 1.0, endKm: 12.6, lineType: 'MULTIPLE', electrified: true },
      { code: 'SEC-D-02', name: 'Tiruchengode - Uthangarai', startKm: 12.6, endKm: 26.8, lineType: 'DOUBLE', electrified: true },
      { code: 'SEC-D-03', name: 'Uthangarai - Vaniyambadi', startKm: 26.8, endKm: 39.5, lineType: 'DOUBLE', electrified: true },
      { code: 'SEC-D-04', name: 'Vaniyambadi - Walajah Road', startKm: 39.5, endKm: 54.2, lineType: 'DOUBLE', electrified: true },
    ],
  },
];

const HISTORY_TASK_TYPES = [
  { taskType: 'RAIL_GRINDING', department: 'ENG', baseMinutes: 70 },
  { taskType: 'TAMPING', department: 'ENG', baseMinutes: 105 },
  { taskType: 'WELD_REPAIR', department: 'ENG', baseMinutes: 60 },
  { taskType: 'BALLAST_RENEWAL', department: 'ENG', baseMinutes: 180 },
  { taskType: 'TRACK_GEOMETRY_CORRECTION', department: 'ENG', baseMinutes: 90 },
  { taskType: 'POINT_MACHINE_OVERHAUL', department: 'SNT', baseMinutes: 65 },
  { taskType: 'TRACK_CIRCUIT_TUNING', department: 'SNT', baseMinutes: 45 },
  { taskType: 'RELAY_TESTING', department: 'SNT', baseMinutes: 95 },
  { taskType: 'AXLE_COUNTER_CALIBRATION', department: 'SNT', baseMinutes: 50 },
  { taskType: 'CONTACT_WIRE_INSPECTION', department: 'TRD', baseMinutes: 85 },
  { taskType: 'INSULATOR_REPLACEMENT', department: 'TRD', baseMinutes: 110 },
  { taskType: 'ISOLATOR_SERVICING', department: 'TRD', baseMinutes: 120 },
  { taskType: 'OHE_TENSIONING', department: 'TRD', baseMinutes: 140 },
];

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const SEVERITY_RISK = { LOW: 0.05, MEDIUM: 0.15, HIGH: 0.35, CRITICAL: 0.6 };

/** Number of synthetic historical outcomes generated for the learning models. */
const HISTORY_ROWS = 2200;

async function seedNetwork(connection) {
  let corridorCount = 0;
  let sectionCount = 0;

  for (const corridor of CORRIDORS) {
    await connection.execute(
      `INSERT INTO corridors (id, code, name, description, importance_score, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ${NOW}, ${NOW})
       ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description),
                               importance_score = VALUES(importance_score), updated_at = ${NOW}`,
      [randomUUID(), corridor.code, corridor.name, corridor.description, corridor.importanceScore],
    );

    const [corridorRows] = await connection.execute('SELECT id FROM corridors WHERE code = ?', [
      corridor.code,
    ]);
    const corridorId = corridorRows[0].id;
    corridorCount += 1;

    for (const [index, section] of corridor.sections.entries()) {
      await connection.execute(
        `INSERT INTO sections (id, corridor_id, code, name, sequence_number, start_km, end_km,
                               line_type, electrified, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ${NOW}, ${NOW})
         ON DUPLICATE KEY UPDATE corridor_id = VALUES(corridor_id), name = VALUES(name),
                                 sequence_number = VALUES(sequence_number),
                                 start_km = VALUES(start_km), end_km = VALUES(end_km),
                                 line_type = VALUES(line_type), electrified = VALUES(electrified),
                                 updated_at = ${NOW}`,
        [
          randomUUID(),
          corridorId,
          section.code,
          section.name,
          index + 1,
          section.startKm,
          section.endKm,
          section.lineType,
          section.electrified ? 1 : 0,
        ],
      );

      sectionCount += 1;
    }
  }

  return { corridorCount, sectionCount };
}

/**
 * Builds synthetic maintenance outcomes with a deliberate, learnable signal:
 * risk rises with severity, overdue days, criticality, a safety-critical flag
 * and an active speed restriction. This is demonstration data, not observed
 * Indian Railways performance.
 */
function buildHistoryRows(seed) {
  const random = createRandom(deriveSeed(seed, 'HISTORY'));
  const rows = [];
  const nowMs = Date.now();

  for (let index = 0; index < HISTORY_ROWS; index += 1) {
    const profile = pick(random, HISTORY_TASK_TYPES);
    const severity = pick(random, SEVERITIES);
    const criticality = intBetween(random, 1, 5);
    const daysOverdue = chance(random, 0.45) ? intBetween(random, 1, 60) : 0;
    const safetyCritical = severity === 'CRITICAL' ? chance(random, 0.7) : chance(random, 0.12);
    const speedRestriction = chance(random, 0.25) ? pick(random, [15, 30, 45, 60, 75]) : null;
    const corridorImportance = pick(random, [3, 3, 5, 5, 5]);
    const repeatCount = chance(random, 0.35) ? intBetween(random, 1, 4) : 0;

    const requested = profile.baseMinutes + intBetween(random, -15, 25);

    // Real work overruns more often than it finishes early, and overruns grow
    // with severity, so P90 sits meaningfully above the median.
    const overrunFactor = 1 + random() * (0.15 + SEVERITY_RISK[severity]);
    const actual = Math.max(15, Math.round(requested * overrunFactor));

    // Logistic-shaped ground truth the model should be able to recover.
    const logit =
      -2.6 +
      SEVERITY_RISK[severity] * 4.2 +
      (criticality - 3) * 0.34 +
      Math.min(daysOverdue, 60) * 0.045 +
      (safetyCritical ? 1.05 : 0) +
      (speedRestriction ? 0.75 : 0) +
      (corridorImportance - 3) * 0.16 +
      repeatCount * 0.28;

    const probability = 1 / (1 + Math.exp(-logit));
    const failed = random() < probability;

    rows.push([
      randomUUID(),
      profile.taskType,
      profile.department,
      criticality,
      severity,
      daysOverdue,
      safetyCritical ? 1 : 0,
      speedRestriction,
      corridorImportance,
      repeatCount,
      requested,
      actual,
      failed ? 1 : 0,
      new Date(nowMs - intBetween(random, 1, 720) * 86_400_000)
        .toISOString()
        .slice(0, 23)
        .replace('T', ' '),
      'SYNTHETIC',
    ]);
  }

  return rows;
}

async function seedHistory(connection, seed) {
  // History is fully regenerated so the seed stays deterministic across re-runs.
  await connection.query('DELETE FROM maintenance_history');

  const rows = buildHistoryRows(seed);
  const chunkSize = 100;

  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const placeholders = chunk.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');

    await connection.query(
      `INSERT INTO maintenance_history
         (id, task_type, department, asset_criticality, severity, days_overdue_at_planning,
          safety_critical, speed_restriction_kmph, corridor_importance, repeat_count,
          requested_duration_minutes, actual_duration_minutes,
          failure_or_escalation_before_work, completed_at, data_origin)
       VALUES ${placeholders}`,
      chunk.flat(),
    );
  }

  return rows.length;
}

export async function runSeed() {
  await runMigrations();

  const network = await withTransaction((connection) => seedNetwork(connection));
  console.log(
    `[seed] network ready: ${network.corridorCount} corridors, ${network.sectionCount} sections`,
  );

  const sourceIds = await registerSourceSystems();
  console.log(`[seed] registered ${sourceIds.size} source systems`);

  const historyRows = await withTransaction((connection) =>
    seedHistory(connection, env.planning.demoSeed),
  );
  console.log(`[seed] inserted ${historyRows} synthetic maintenance history rows`);

  console.log('[seed] done. Synthetic demonstration data - not Indian Railways production data.');
  console.log('[seed] next: start the API and POST /api/v1/sources/sync-all');
}

if (process.argv[1]?.endsWith('seed.js')) {
  runSeed()
    .then(async () => {
      await closePool();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('[seed] failed:', error.message);
      await closePool().catch(() => {});
      process.exit(1);
    });
}
