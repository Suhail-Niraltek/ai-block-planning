import { withTransaction } from '../../database/connection.js';
import { ApiError } from '../../middleware/api-response.js';
import { buildDurationIndex, predictDuration } from '../planning/duration-engine.js';
import { calculateRulePriority } from '../planning/priority-engine.js';
import {
  MIN_HISTORY_ROWS,
  loadRiskModel,
  predictRisk,
  saveRiskModel,
  trainRiskModel,
} from '../planning/risk-model.js';
import * as repository from './maintenance.repository.js';

/** Rehydrates the JSON column, which mysql2 may return as a string. */
function parseReasons(value) {
  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }

  return value;
}

function toBoolean(value) {
  return value === 1 || value === true;
}

function mapTask(row) {
  return {
    ...row,
    requiresLineBlock: toBoolean(row.requiresLineBlock),
    requiresPowerBlock: toBoolean(row.requiresPowerBlock),
    requiresDisconnection: toBoolean(row.requiresDisconnection),
    safetyCritical: toBoolean(row.safetyCritical),
    priorityScore: Number(row.priorityScore),
    priorityReasons: parseReasons(row.priorityReasons),
    synthetic: true,
  };
}

export async function listTasks(filters, limit) {
  const rows = await repository.findTasks(filters, limit);
  return rows.map(mapTask);
}

export async function getTask(id) {
  const row = await repository.findTaskById(id);

  if (!row) {
    throw ApiError.notFound(`Maintenance task ${id} not found`);
  }

  return mapTask(row);
}

export function getSummary() {
  return repository.getSummary();
}

function daysOverdueFrom(dueAt, nowMs) {
  const dueMs = new Date(`${String(dueAt).replace(' ', 'T')}Z`).getTime();
  const diff = nowMs - dueMs;
  return diff <= 0 ? 0 : Math.floor(diff / 86_400_000);
}

/**
 * Recomputes priority and predicted duration for every task.
 *
 * The learned model is retrained from current history on each call so the
 * demo can show the ML path working end to end. If history is too thin, or
 * training or scoring fails for any reason, every task falls back to the
 * transparent rule engine and says so.
 */
export async function recalculatePriorities({ retrain = true } = {}) {
  const history = await repository.findMaintenanceHistory();
  const durationIndex = buildDurationIndex(history);

  let model = null;
  let modelStatus = { available: false, reason: null, metrics: null };

  if (retrain) {
    const trained = trainRiskModel(
      history.map((row) => ({ ...row, failureOrEscalation: toBoolean(row.failureOrEscalation) })),
    );

    if (trained.trained) {
      await saveRiskModel(trained);
      model = trained;
      modelStatus = { available: true, reason: null, metrics: trained.metrics };
    } else {
      modelStatus = { available: false, reason: trained.reason, metrics: null };
    }
  }

  if (!model) {
    model = await loadRiskModel();

    if (model) {
      modelStatus = { available: true, reason: 'Loaded previously saved model', metrics: model.metrics };
    }
  }

  const tasks = await repository.findTasksForScoring();
  const nowMs = Date.now();

  let mlScored = 0;
  let ruleScored = 0;

  const scored = tasks.map((task) => {
    const daysOverdue = daysOverdueFrom(task.dueAt, nowMs);

    const normalised = {
      ...task,
      daysOverdue,
      safetyCritical: toBoolean(task.safetyCritical),
      criticality: Number(task.criticality),
      corridorImportance: Number(task.corridorImportance),
      repeatCount: Number(task.repeatCount),
    };

    const rule = calculateRulePriority(normalised);
    const duration = predictDuration(normalised, durationIndex);

    let priorityScore = rule.score;
    let prioritySource = rule.source;
    let reasons = rule.reasons;

    if (model) {
      try {
        const risk = predictRisk(model, normalised);

        priorityScore = Math.round(risk.probability * 10000) / 100;
        prioritySource = 'ML';
        reasons = [
          {
            factor: 'ML_RISK_PROBABILITY',
            contribution: priorityScore,
            detail:
              `Logistic regression estimates a ${(risk.probability * 100).toFixed(1)}% chance of ` +
              'failure or escalation before this work is done',
          },
          ...risk.contributions.slice(0, 5).map((item) => ({
            factor: `ML_${item.feature.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
            contribution: Math.round(item.contribution * 100) / 100,
            detail: `Model feature "${item.feature}" pushes the estimate ${
              item.contribution >= 0 ? 'up' : 'down'
            }`,
          })),
          {
            factor: 'RULE_REFERENCE_SCORE',
            contribution: rule.score,
            detail: 'Score the transparent rule engine would have produced, shown for comparison',
          },
          ...rule.reasons,
        ];

        mlScored += 1;
      } catch {
        // Any scoring failure silently degrades to the explainable path.
        ruleScored += 1;
      }
    } else {
      ruleScored += 1;
    }

    return {
      id: task.id,
      priorityScore,
      prioritySource,
      priorityReasons: reasons,
      predictedDurationMinutes: duration.predictedMinutes,
      predictedDurationSampleCount: duration.sampleCount,
      durationSource: duration.source,
      daysOverdue,
    };
  });

  await withTransaction(async (connection) => {
    for (const task of scored) {
      await repository.updateTaskScoring(connection, task);
    }
  });

  return {
    tasksScored: scored.length,
    mlScored,
    ruleScored,
    historyRows: history.length,
    minimumHistoryRows: MIN_HISTORY_ROWS,
    model: modelStatus,
    dataOrigin: 'SYNTHETIC',
    note: 'Model trained on synthetic demonstration history, not Indian Railways production data.',
  };
}
