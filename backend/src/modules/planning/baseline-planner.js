import { createCapacityLedger, solveGreedy } from './fallback-solver.js';

/**
 * Baseline plan: what today's decentralized process produces.
 *
 * Each department plans on its own, in due-date then severity order, taking the
 * first window that works for it. No department knows what the others asked
 * for, so a block is never shared. This is the honest comparator the problem
 * statement's "decentralized and manual" framing calls for - it uses exactly
 * the same tasks, windows, durations and safety rules as the optimized run, so
 * any difference in the metrics comes from coordination alone.
 */

const DEPARTMENT_ORDER = ['ENG', 'TRD', 'SNT'];
const SEVERITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export function orderTasksForDepartment(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.dueAtMs !== b.dueAtMs) return a.dueAtMs - b.dueAtMs;

    const severityDelta = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severityDelta !== 0) return severityDelta;

    return a.id.localeCompare(b.id);
  });
}

export function buildBaselinePlan({ tasks, options, rejections }) {
  const assignments = [];
  const unscheduled = new Map(rejections);

  // One ledger shared across every department, so a window already claimed by
  // Engineering is genuinely unavailable to Traction Distribution. Without this
  // the baseline would silently double-book and look better than it is.
  const ledger = createCapacityLedger();

  // Departments are planned one after another, each unaware of the others.
  for (const department of DEPARTMENT_ORDER) {
    const departmentTasks = orderTasksForDepartment(
      tasks.filter((task) => task.department === department),
    );

    if (departmentTasks.length === 0) {
      continue;
    }

    const departmentTaskIds = new Set(departmentTasks.map((task) => task.id));
    const departmentOptions = options.filter((option) => departmentTaskIds.has(option.taskId));

    const result = solveGreedy({
      tasks: departmentTasks,
      options: departmentOptions,
      rejections: new Map(
        [...rejections].filter(([taskId]) => departmentTaskIds.has(taskId)),
      ),
      allowBundling: false,
      ledger,
      // Departments plan in due-date order rather than by learned risk, because
      // that is what a manual departmental schedule actually does.
      orderTasks: orderTasksForDepartment,
    });

    assignments.push(...result.assignments);

    for (const [taskId, reason] of result.unscheduled) {
      unscheduled.set(taskId, reason);
    }
  }

  return { status: 'FALLBACK_FEASIBLE', assignments, unscheduled };
}
