import { REASON_CODES } from './candidate-window-engine.js';

/**
 * Greedy fallback used when GLPK fails or times out.
 *
 * It never relaxes a constraint the MILP would have enforced: it only searches
 * less thoroughly. Ordering is fully deterministic, ending on the task id, so
 * the same inputs always produce the same plan.
 */

export function orderTasksByUrgency(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.safetyCritical !== b.safetyCritical) {
      return a.safetyCritical ? -1 : 1;
    }

    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }

    if (a.dueAtMs !== b.dueAtMs) {
      return a.dueAtMs - b.dueAtMs;
    }

    return a.id.localeCompare(b.id);
  });
}

/**
 * Tracks how many minutes each department has already committed inside a
 * segment. Departments work in parallel, so each has its own budget.
 */
export function createCapacityLedger() {
  const used = new Map();

  return {
    usedMinutes(segmentId, department) {
      return used.get(`${segmentId}|${department}`) ?? 0;
    },
    departmentsIn(segmentId) {
      const departments = new Set();

      for (const key of used.keys()) {
        const [id, department] = key.split('|');
        if (id === segmentId) departments.add(department);
      }

      return departments;
    },
    commit(segmentId, department, minutes) {
      const key = `${segmentId}|${department}`;
      used.set(key, (used.get(key) ?? 0) + minutes);
    },
    isUsed(segmentId) {
      return this.departmentsIn(segmentId).size > 0;
    },
  };
}

/**
 * @param {object} input
 * @param {Array} input.tasks
 * @param {Array} input.options    feasible (task, segment) pairs
 * @param {Map}   input.rejections tasks with no feasible option at all
 * @param {boolean} input.allowBundling  false reproduces single-department planning
 * @param {object}  [input.ledger]   shared capacity ledger; pass one across several
 *                                   calls so departments compete for the same windows
 * @param {Function} [input.orderTasks] ordering strategy, defaults to urgency order
 */
export function solveGreedy({
  tasks,
  options,
  rejections,
  allowBundling = true,
  ledger = createCapacityLedger(),
  orderTasks = orderTasksByUrgency,
}) {
  const optionsByTask = new Map();

  for (const option of options) {
    if (!optionsByTask.has(option.taskId)) optionsByTask.set(option.taskId, []);
    optionsByTask.get(option.taskId).push(option);
  }

  const assignments = [];
  const unscheduled = new Map(rejections);

  for (const task of orderTasks(tasks)) {
    if (unscheduled.has(task.id)) {
      continue;
    }

    const taskOptions = optionsByTask.get(task.id) ?? [];

    if (taskOptions.length === 0) {
      unscheduled.set(task.id, {
        reasonCode: REASON_CODES.NO_BLOCK_WINDOW,
        explanation: 'No feasible window was found for this task',
      });
      continue;
    }

    const viable = taskOptions.filter((option) => {
      const committed = ledger.usedMinutes(option.segmentId, task.department);
      const fits =
        committed + task.predictedDurationMinutes <= option.segment.durationMinutes;

      if (!fits) {
        return false;
      }

      if (allowBundling) {
        return true;
      }

      // Baseline behaviour: a block is requested by one department only, so a
      // segment already claimed by another department is unavailable.
      const departments = ledger.departmentsIn(option.segmentId);
      return departments.size === 0 || departments.has(task.department);
    });

    if (viable.length === 0) {
      unscheduled.set(task.id, {
        reasonCode: allowBundling
          ? REASON_CODES.INSUFFICIENT_DURATION
          : REASON_CODES.INCOMPATIBLE_TASK,
        explanation: allowBundling
          ? 'Every feasible window was already filled by higher-priority work'
          : 'Every feasible window was already claimed by another department',
      });
      continue;
    }

    viable.sort((a, b) => {
      if (allowBundling) {
        // Reusing an open block adds no new downtime, so prefer it.
        const aOpen = ledger.isUsed(a.segmentId) ? 0 : 1;
        const bOpen = ledger.isUsed(b.segmentId) ? 0 : 1;
        if (aOpen !== bOpen) return aOpen - bOpen;
      }

      if (a.impactScore !== b.impactScore) return a.impactScore - b.impactScore;
      if (a.segment.start !== b.segment.start) return a.segment.start - b.segment.start;

      return a.segmentId.localeCompare(b.segmentId);
    });

    const chosen = viable[0];

    ledger.commit(chosen.segmentId, task.department, task.predictedDurationMinutes);

    assignments.push({
      taskId: task.id,
      segmentId: chosen.segmentId,
      reason: allowBundling
        ? 'Lowest-impact feasible window, preferring an already-open block'
        : 'Earliest feasible window for this department, no bundling',
    });
  }

  return { assignments, unscheduled };
}

export function solveWithFallback(input) {
  const { assignments, unscheduled } = solveGreedy({ ...input, allowBundling: true });

  return {
    status: assignments.length > 0 ? 'FALLBACK_FEASIBLE' : 'INFEASIBLE',
    assignments,
    unscheduled,
  };
}
