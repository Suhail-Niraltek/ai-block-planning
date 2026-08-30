import { randomUUID } from 'node:crypto';
import { pool, query, queryOne } from '../../database/connection.js';

const NOW = 'UTC_TIMESTAMP(3)';

/** MySQL returns DATETIME(3) as 'YYYY-MM-DD HH:MM:SS.mmm' in UTC. */
export function toMs(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();

  return Date.parse(`${String(value).replace(' ', 'T')}Z`);
}

export function toMysql(ms) {
  return new Date(ms).toISOString().slice(0, 23).replace('T', ' ');
}

function corridorFilter(corridorIds, alias) {
  if (!corridorIds || corridorIds.length === 0) {
    return { clause: '', params: [] };
  }

  const placeholders = corridorIds.map(() => '?').join(',');
  return { clause: ` AND ${alias} IN (${placeholders})`, params: [...corridorIds] };
}

/** Loads everything the planner needs for one horizon, in five queries. */
export async function loadPlanningInputs({ horizonStart, horizonEnd, corridorIds }) {
  const taskFilter = corridorFilter(corridorIds, 'cor.id');
  const windowFilter = corridorFilter(corridorIds, 'w.corridor_id');
  const movementFilter = corridorFilter(corridorIds, 'sec.corridor_id');
  const forecastFilter = corridorFilter(corridorIds, 'f.corridor_id');
  const sectionFilter = corridorFilter(corridorIds, 'sec.corridor_id');

  const tasks = await query(
    `SELECT t.id, t.department, t.task_type AS taskType, t.title, t.severity,
            t.criticality, t.safety_critical AS safetyCritical,
            t.priority_score AS priorityScore, t.priority_source AS prioritySource,
            t.requested_duration_minutes AS requestedDurationMinutes,
            t.predicted_duration_minutes AS predictedDurationMinutes,
            t.requires_line_block AS requiresLineBlock,
            t.requires_power_block AS requiresPowerBlock,
            t.requires_disconnection AS requiresDisconnection,
            t.days_overdue AS daysOverdue, t.earliest_start AS earliestStart, t.due_at AS dueAt,
            t.section_id AS sectionId, sec.code AS sectionCode, sec.name AS sectionName,
            cor.id AS corridorId, cor.code AS corridorCode
     FROM maintenance_tasks t
     JOIN sections sec ON sec.id = t.section_id
     JOIN corridors cor ON cor.id = sec.corridor_id
     WHERE t.status IN ('READY', 'PLANNED')${taskFilter.clause}
     ORDER BY t.priority_score DESC, t.id ASC`,
    taskFilter.params,
  );

  const windows = await query(
    `SELECT w.id, w.corridor_id AS corridorId, w.section_id AS sectionId,
            w.starts_at AS startsAt, w.ends_at AS endsAt,
            w.available_line_count AS availableLineCount,
            w.power_isolation_available AS powerIsolationAvailable,
            w.signalling_disconnection_available AS signallingDisconnectionAvailable,
            w.confidence
     FROM block_windows w
     WHERE w.status = 'AVAILABLE' AND w.ends_at > ? AND w.starts_at < ?${windowFilter.clause}
     ORDER BY w.starts_at ASC`,
    [toMysql(horizonStart), toMysql(horizonEnd), ...windowFilter.params],
  );

  const movements = await query(
    `SELECT m.id, m.train_number AS trainNumber, m.train_type AS trainType,
            m.priority_class AS priorityClass, m.section_id AS sectionId,
            m.entry_at AS entryAt, m.exit_at AS exitAt, m.protected
     FROM train_movements m
     JOIN sections sec ON sec.id = m.section_id
     WHERE m.exit_at > ? AND m.entry_at < ?${movementFilter.clause}
     ORDER BY m.entry_at ASC`,
    [toMysql(horizonStart), toMysql(horizonEnd), ...movementFilter.params],
  );

  const forecasts = await query(
    `SELECT f.id, f.corridor_id AS corridorId, f.bucket_start AS bucketStart,
            f.bucket_end AS bucketEnd, f.expected_train_count AS expectedTrainCount,
            f.lower_count AS lowerCount, f.upper_count AS upperCount
     FROM goods_forecasts f
     WHERE f.bucket_end > ? AND f.bucket_start < ?${forecastFilter.clause}
     ORDER BY f.bucket_start ASC`,
    [toMysql(horizonStart), toMysql(horizonEnd), ...forecastFilter.params],
  );

  const sectionRow = await queryOne(
    `SELECT COUNT(*) AS total FROM sections sec WHERE sec.active = 1${sectionFilter.clause}`,
    sectionFilter.params,
  );

  return {
    tasks: tasks.map((task) => ({
      ...task,
      safetyCritical: task.safetyCritical === 1,
      requiresLineBlock: task.requiresLineBlock === 1,
      requiresPowerBlock: task.requiresPowerBlock === 1,
      requiresDisconnection: task.requiresDisconnection === 1,
      priorityScore: Number(task.priorityScore),
      // A task with no prediction yet falls back to its requested duration.
      predictedDurationMinutes: Number(
        task.predictedDurationMinutes ?? task.requestedDurationMinutes,
      ),
      earliestStartMs: toMs(task.earliestStart),
      dueAtMs: toMs(task.dueAt),
    })),
    windows: windows.map((window) => ({
      ...window,
      start: toMs(window.startsAt),
      end: toMs(window.endsAt),
      powerIsolationAvailable: window.powerIsolationAvailable === 1,
      signallingDisconnectionAvailable: window.signallingDisconnectionAvailable === 1,
      confidence: Number(window.confidence),
    })),
    movements: movements.map((movement) => ({
      ...movement,
      start: toMs(movement.entryAt),
      end: toMs(movement.exitAt),
      protected: movement.protected === 1,
    })),
    forecasts: forecasts.map((bucket) => ({
      ...bucket,
      start: toMs(bucket.bucketStart),
      end: toMs(bucket.bucketEnd),
      expectedTrainCount: Number(bucket.expectedTrainCount),
      lowerCount: Number(bucket.lowerCount),
      upperCount: Number(bucket.upperCount),
    })),
    sectionCount: Number(sectionRow?.total ?? 0),
  };
}

export async function createPlanningRun({ horizonType, horizonStart, horizonEnd }) {
  const id = randomUUID();

  await pool.execute(
    `INSERT INTO planning_runs (id, horizon_type, horizon_start, horizon_end, status,
                                started_at, created_at)
     VALUES (?, ?, ?, ?, 'RUNNING', ${NOW}, ${NOW})`,
    [id, horizonType, toMysql(horizonStart), toMysql(horizonEnd)],
  );

  return id;
}

export async function completePlanningRun(runId, solverType) {
  await pool.execute(
    `UPDATE planning_runs SET status = 'COMPLETED', solver_type = ?, completed_at = ${NOW}
     WHERE id = ?`,
    [solverType, runId],
  );
}

export async function failPlanningRun(runId, message) {
  await pool.execute(
    `UPDATE planning_runs SET status = 'FAILED', completed_at = ${NOW}, error_message = ?
     WHERE id = ?`,
    [String(message).slice(0, 2000), runId],
  );
}

/** Persists one plan with its blocks, task assignments, and unscheduled reasons. */
export async function savePlan(connection, { runId, planType, horizon, metrics, solverStatus, blocks, unscheduled, tasks }) {
  const planId = randomUUID();

  await connection.execute(
    `INSERT INTO plans (id, planning_run_id, plan_type, horizon_type, horizon_start, horizon_end,
                        total_tasks, scheduled_tasks, unscheduled_tasks,
                        critical_tasks_scheduled, critical_tasks_unscheduled,
                        total_block_count, total_block_minutes, asset_availability_percentage,
                        train_impact_score, multi_department_block_count, solver_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${NOW})`,
    [
      planId,
      runId,
      planType,
      horizon.type,
      toMysql(horizon.start),
      toMysql(horizon.end),
      metrics.totalTasks,
      metrics.scheduledTasks,
      metrics.unscheduledTasks,
      metrics.criticalTasksScheduled,
      metrics.criticalTasksUnscheduled,
      metrics.totalBlockCount,
      metrics.totalBlockMinutes,
      metrics.assetAvailabilityPercentage,
      metrics.trainImpactScore,
      metrics.multiDepartmentBlockCount,
      solverStatus,
    ],
  );

  for (const block of blocks) {
    const blockId = randomUUID();

    await connection.execute(
      `INSERT INTO plan_blocks (id, plan_id, block_window_id, corridor_id, section_id,
                                starts_at, ends_at, block_type, departments_json,
                                utilization_percentage, train_impact_score, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${NOW})`,
      [
        blockId,
        planId,
        block.blockWindowId,
        block.corridorId,
        block.sectionId,
        toMysql(block.startsAt),
        toMysql(block.endsAt),
        block.blockType,
        JSON.stringify(block.departments),
        block.utilizationPercentage,
        block.trainImpactScore,
      ],
    );

    for (const blockTask of block.tasks) {
      await connection.execute(
        `INSERT INTO plan_block_tasks (id, plan_block_id, maintenance_task_id, planned_start,
                                       planned_end, sequence_number, assignment_reason_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ${NOW})`,
        [
          randomUUID(),
          blockId,
          blockTask.maintenanceTaskId,
          toMysql(blockTask.plannedStart),
          toMysql(blockTask.plannedEnd),
          blockTask.sequenceNumber,
          JSON.stringify(blockTask.assignmentReason),
        ],
      );
    }
  }

  const taskById = new Map(tasks.map((task) => [task.id, task]));

  for (const [taskId, reason] of unscheduled) {
    if (!taskById.has(taskId)) {
      continue;
    }

    await connection.execute(
      `INSERT INTO unscheduled_tasks (id, plan_id, maintenance_task_id, reason_code, explanation, created_at)
       VALUES (?, ?, ?, ?, ?, ${NOW})`,
      [randomUUID(), planId, taskId, reason.reasonCode, String(reason.explanation).slice(0, 500)],
    );
  }

  return planId;
}

const RUN_COLUMNS = `
  id, horizon_type AS horizonType, horizon_start AS horizonStart, horizon_end AS horizonEnd,
  status, solver_type AS solverType, started_at AS startedAt, completed_at AS completedAt,
  error_message AS errorMessage, created_at AS createdAt
`;

const PLAN_COLUMNS = `
  id, planning_run_id AS planningRunId, plan_type AS planType, horizon_type AS horizonType,
  horizon_start AS horizonStart, horizon_end AS horizonEnd, total_tasks AS totalTasks,
  scheduled_tasks AS scheduledTasks, unscheduled_tasks AS unscheduledTasks,
  critical_tasks_scheduled AS criticalTasksScheduled,
  critical_tasks_unscheduled AS criticalTasksUnscheduled,
  total_block_count AS totalBlockCount, total_block_minutes AS totalBlockMinutes,
  asset_availability_percentage AS assetAvailabilityPercentage,
  train_impact_score AS trainImpactScore,
  multi_department_block_count AS multiDepartmentBlockCount,
  solver_status AS solverStatus, created_at AS createdAt
`;

export function findRuns(limit = 25) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 25, 1), 100);

  return query(`SELECT ${RUN_COLUMNS} FROM planning_runs ORDER BY started_at DESC LIMIT ${safeLimit}`);
}

export function findRunById(id) {
  return queryOne(`SELECT ${RUN_COLUMNS} FROM planning_runs WHERE id = ?`, [id]);
}

export function findPlansByRunId(runId) {
  return query(
    `SELECT ${PLAN_COLUMNS} FROM plans WHERE planning_run_id = ? ORDER BY plan_type ASC`,
    [runId],
  );
}

export function findPlanById(id) {
  return queryOne(`SELECT ${PLAN_COLUMNS} FROM plans WHERE id = ?`, [id]);
}

export async function findPlanBlocks(planId) {
  const blocks = await query(
    `SELECT b.id, b.block_window_id AS blockWindowId, b.corridor_id AS corridorId,
            b.section_id AS sectionId, sec.code AS sectionCode, sec.name AS sectionName,
            cor.code AS corridorCode, b.starts_at AS startsAt, b.ends_at AS endsAt,
            b.block_type AS blockType, b.departments_json AS departments,
            b.utilization_percentage AS utilizationPercentage,
            b.train_impact_score AS trainImpactScore
     FROM plan_blocks b
     JOIN sections sec ON sec.id = b.section_id
     JOIN corridors cor ON cor.id = b.corridor_id
     WHERE b.plan_id = ?
     ORDER BY b.starts_at ASC, sec.code ASC`,
    [planId],
  );

  if (blocks.length === 0) {
    return [];
  }

  const placeholders = blocks.map(() => '?').join(',');

  const blockTasks = await query(
    `SELECT bt.plan_block_id AS planBlockId, bt.maintenance_task_id AS maintenanceTaskId,
            bt.planned_start AS plannedStart, bt.planned_end AS plannedEnd,
            bt.sequence_number AS sequenceNumber, bt.assignment_reason_json AS assignmentReason,
            t.title, t.department, t.severity, t.task_type AS taskType,
            t.priority_score AS priorityScore, t.priority_source AS prioritySource,
            t.predicted_duration_minutes AS predictedDurationMinutes,
            t.requested_duration_minutes AS requestedDurationMinutes,
            t.safety_critical AS safetyCritical
     FROM plan_block_tasks bt
     JOIN maintenance_tasks t ON t.id = bt.maintenance_task_id
     WHERE bt.plan_block_id IN (${placeholders})
     ORDER BY bt.planned_start ASC, bt.sequence_number ASC`,
    blocks.map((block) => block.id),
  );

  const tasksByBlock = new Map();

  for (const task of blockTasks) {
    if (!tasksByBlock.has(task.planBlockId)) tasksByBlock.set(task.planBlockId, []);
    tasksByBlock.get(task.planBlockId).push(task);
  }

  return blocks.map((block) => ({
    ...block,
    tasks: tasksByBlock.get(block.id) ?? [],
  }));
}

export function findUnscheduledTasks(planId) {
  return query(
    `SELECT u.id, u.maintenance_task_id AS maintenanceTaskId, u.reason_code AS reasonCode,
            u.explanation, t.title, t.department, t.severity, t.task_type AS taskType,
            t.priority_score AS priorityScore, t.due_at AS dueAt,
            t.days_overdue AS daysOverdue,
            t.predicted_duration_minutes AS predictedDurationMinutes,
            t.requested_duration_minutes AS requestedDurationMinutes,
            t.safety_critical AS safetyCritical,
            sec.code AS sectionCode, sec.name AS sectionName
     FROM unscheduled_tasks u
     JOIN maintenance_tasks t ON t.id = u.maintenance_task_id
     JOIN sections sec ON sec.id = t.section_id
     WHERE u.plan_id = ?
     ORDER BY t.priority_score DESC, t.due_at ASC`,
    [planId],
  );
}

export async function markTasksPlanned(connection, taskIds) {
  if (taskIds.length === 0) {
    return;
  }

  const placeholders = taskIds.map(() => '?').join(',');

  await connection.query(
    `UPDATE maintenance_tasks SET status = 'PLANNED', updated_at = ${NOW}
     WHERE id IN (${placeholders})`,
    taskIds,
  );
}
