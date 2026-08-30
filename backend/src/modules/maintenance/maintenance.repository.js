import { query, queryOne } from '../../database/connection.js';

const TASK_COLUMNS = `
  t.id, t.external_id AS externalId, t.department, t.task_type AS taskType, t.title,
  t.earliest_start AS earliestStart, t.due_at AS dueAt,
  t.requested_duration_minutes AS requestedDurationMinutes,
  t.predicted_duration_minutes AS predictedDurationMinutes,
  t.predicted_duration_sample_count AS predictedDurationSampleCount,
  t.requires_line_block AS requiresLineBlock,
  t.requires_power_block AS requiresPowerBlock,
  t.requires_disconnection AS requiresDisconnection,
  t.severity, t.criticality, t.safety_critical AS safetyCritical,
  t.speed_restriction_kmph AS speedRestrictionKmph, t.repeat_count AS repeatCount,
  t.days_overdue AS daysOverdue, t.priority_score AS priorityScore,
  t.priority_source AS prioritySource, t.priority_reasons_json AS priorityReasons,
  t.status, t.created_at AS createdAt, t.updated_at AS updatedAt,
  t.section_id AS sectionId, sec.code AS sectionCode, sec.name AS sectionName,
  t.asset_id AS assetId, a.asset_code AS assetCode, a.asset_type AS assetType,
  cor.id AS corridorId, cor.code AS corridorCode, cor.name AS corridorName,
  cor.importance_score AS corridorImportance,
  src.code AS sourceCode, src.name AS sourceName
`;

const TASK_FROM = `
  FROM maintenance_tasks t
  JOIN sections sec ON sec.id = t.section_id
  JOIN corridors cor ON cor.id = sec.corridor_id
  JOIN assets a ON a.id = t.asset_id
  JOIN source_systems src ON src.id = t.source_system_id
`;

/** Builds the WHERE clause and bound parameters for the task list filters. */
function buildFilters(filters = {}) {
  const clauses = [];
  const params = [];

  if (filters.department) {
    clauses.push('t.department = ?');
    params.push(filters.department);
  }

  if (filters.sectionId) {
    clauses.push('t.section_id = ?');
    params.push(filters.sectionId);
  }

  if (filters.corridorId) {
    clauses.push('cor.id = ?');
    params.push(filters.corridorId);
  }

  if (filters.severity) {
    clauses.push('t.severity = ?');
    params.push(filters.severity);
  }

  if (filters.status) {
    clauses.push('t.status = ?');
    params.push(filters.status);
  }

  if (filters.overdue === true) {
    clauses.push('t.days_overdue > 0');
  } else if (filters.overdue === false) {
    clauses.push('t.days_overdue = 0');
  }

  if (filters.minPriority !== undefined && filters.minPriority !== null) {
    clauses.push('t.priority_score >= ?');
    params.push(filters.minPriority);
  }

  return { where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export function findTasks(filters = {}, limit = 500) {
  const { where, params } = buildFilters(filters);
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 500, 1), 2000);

  return query(
    `SELECT ${TASK_COLUMNS} ${TASK_FROM} ${where}
     ORDER BY t.priority_score DESC, t.due_at ASC, t.id ASC
     LIMIT ${safeLimit}`,
    params,
  );
}

export function findTaskById(id) {
  return queryOne(`SELECT ${TASK_COLUMNS} ${TASK_FROM} WHERE t.id = ?`, [id]);
}

/** Everything the priority and duration engines need, in one pass. */
export function findTasksForScoring() {
  return query(
    `SELECT t.id, t.department, t.task_type AS taskType, t.severity, t.criticality,
            t.safety_critical AS safetyCritical, t.speed_restriction_kmph AS speedRestrictionKmph,
            t.repeat_count AS repeatCount, t.days_overdue AS daysOverdue,
            t.requested_duration_minutes AS requestedDurationMinutes,
            t.due_at AS dueAt, cor.importance_score AS corridorImportance
     ${TASK_FROM}`,
  );
}

export async function updateTaskScoring(connection, task) {
  await connection.execute(
    `UPDATE maintenance_tasks
     SET priority_score = ?, priority_source = ?, priority_reasons_json = ?,
         predicted_duration_minutes = ?, predicted_duration_sample_count = ?,
         days_overdue = ?, updated_at = UTC_TIMESTAMP(3)
     WHERE id = ?`,
    [
      task.priorityScore,
      task.prioritySource,
      JSON.stringify(task.priorityReasons),
      task.predictedDurationMinutes,
      task.predictedDurationSampleCount,
      task.daysOverdue,
      task.id,
    ],
  );
}

export function findMaintenanceHistory() {
  return query(
    `SELECT task_type AS taskType, department, asset_criticality AS assetCriticality, severity,
            days_overdue_at_planning AS daysOverdue, safety_critical AS safetyCritical,
            speed_restriction_kmph AS speedRestrictionKmph,
            corridor_importance AS corridorImportance, repeat_count AS repeatCount,
            requested_duration_minutes AS requestedDurationMinutes,
            actual_duration_minutes AS actualDurationMinutes,
            failure_or_escalation_before_work AS failureOrEscalation,
            completed_at AS completedAt, data_origin AS dataOrigin
     FROM maintenance_history`,
  );
}

export async function getSummary() {
  const totals = await queryOne(`
    SELECT
      COUNT(*) AS totalTasks,
      SUM(status = 'READY') AS readyTasks,
      SUM(status = 'PLANNED') AS plannedTasks,
      SUM(status = 'DEFERRED') AS deferredTasks,
      SUM(severity = 'CRITICAL') AS criticalTasks,
      SUM(safety_critical = 1) AS safetyCriticalTasks,
      SUM(days_overdue > 0) AS overdueTasks,
      SUM(department = 'ENG') AS engTasks,
      SUM(department = 'TRD') AS trdTasks,
      SUM(department = 'SNT') AS sntTasks,
      SUM(priority_source = 'ML') AS mlScoredTasks,
      SUM(priority_source = 'RULE_FALLBACK') AS ruleScoredTasks,
      ROUND(AVG(priority_score), 2) AS averagePriorityScore
    FROM maintenance_tasks
  `);

  const byDepartment = await query(`
    SELECT department,
           COUNT(*) AS taskCount,
           SUM(severity = 'CRITICAL') AS criticalCount,
           SUM(days_overdue > 0) AS overdueCount,
           ROUND(AVG(priority_score), 2) AS averagePriorityScore
    FROM maintenance_tasks
    GROUP BY department
    ORDER BY department ASC
  `);

  const bySeverity = await query(`
    SELECT severity, COUNT(*) AS taskCount
    FROM maintenance_tasks
    GROUP BY severity
    ORDER BY FIELD(severity, 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW')
  `);

  return { totals, byDepartment, bySeverity };
}
