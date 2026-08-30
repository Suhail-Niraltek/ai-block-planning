import { overlaps } from './candidate-window-engine.js';

/**
 * Independent safety check.
 *
 * This deliberately re-derives every rule from the raw inputs rather than
 * trusting anything the solver reported. If the optimizer and the validator
 * ever disagree, the plan is rejected: on a railway, a silently wrong block
 * plan is worse than no plan.
 */

export const VIOLATION_CODES = {
  TRAIN_CONFLICT: 'TRAIN_CONFLICT',
  TASK_OUTSIDE_BLOCK: 'TASK_OUTSIDE_BLOCK',
  BLOCK_OUTSIDE_WINDOW: 'BLOCK_OUTSIDE_WINDOW',
  BLOCK_OUTSIDE_HORIZON: 'BLOCK_OUTSIDE_HORIZON',
  DUPLICATE_TASK: 'DUPLICATE_TASK',
  POWER_ISOLATION_MISSING: 'POWER_ISOLATION_MISSING',
  DISCONNECTION_MISSING: 'DISCONNECTION_MISSING',
  SECTION_MISMATCH: 'SECTION_MISMATCH',
  DEPARTMENT_OVERLAP: 'DEPARTMENT_OVERLAP',
};

/**
 * @param {object} input
 * @param {Array} input.blocks     assembled blocks
 * @param {Array} input.tasks      every task considered
 * @param {Array} input.segments   candidate segments
 * @param {Array} input.movements  every train movement in the horizon
 * @param {{start:number,end:number}} input.horizon
 * @param {number} input.trainBufferMinutes
 * @returns {{ valid: boolean, violations: Array }}
 */
export function validatePlan({
  blocks,
  tasks,
  segments,
  movements,
  horizon,
  trainBufferMinutes,
}) {
  const violations = [];
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));

  const seenTaskIds = new Set();
  const bufferMs = trainBufferMinutes * 60_000;

  const protectedBySection = new Map();

  for (const movement of movements) {
    if (!movement.protected) {
      continue;
    }

    if (!protectedBySection.has(movement.sectionId)) {
      protectedBySection.set(movement.sectionId, []);
    }

    protectedBySection.get(movement.sectionId).push(movement);
  }

  for (const block of blocks) {
    const segment = segmentById.get(block.segmentId);

    if (block.startsAt < horizon.start || block.endsAt > horizon.end) {
      violations.push({
        code: VIOLATION_CODES.BLOCK_OUTSIDE_HORIZON,
        detail: `Block on section ${block.sectionId} falls outside the selected horizon`,
      });
    }

    if (segment && (block.startsAt < segment.start || block.endsAt > segment.end)) {
      violations.push({
        code: VIOLATION_CODES.BLOCK_OUTSIDE_WINDOW,
        detail: `Block exceeds its candidate window on section ${block.sectionId}`,
      });
    }

    // Re-check protected trains against the raw movement list, including buffer.
    for (const movement of protectedBySection.get(block.sectionId) ?? []) {
      const buffered = { start: movement.start - bufferMs, end: movement.end + bufferMs };

      if (overlaps({ start: block.startsAt, end: block.endsAt }, buffered)) {
        violations.push({
          code: VIOLATION_CODES.TRAIN_CONFLICT,
          detail:
            `Block on section ${block.sectionId} overlaps protected train ` +
            `${movement.trainNumber} (including the ${trainBufferMinutes} min safety buffer)`,
        });
      }
    }

    const perDepartmentIntervals = new Map();

    for (const blockTask of block.tasks) {
      const task = taskById.get(blockTask.maintenanceTaskId);

      if (!task) {
        violations.push({
          code: VIOLATION_CODES.TASK_OUTSIDE_BLOCK,
          detail: `Block references unknown task ${blockTask.maintenanceTaskId}`,
        });
        continue;
      }

      if (seenTaskIds.has(task.id)) {
        violations.push({
          code: VIOLATION_CODES.DUPLICATE_TASK,
          detail: `Task ${task.id} is assigned to more than one block`,
        });
      }

      seenTaskIds.add(task.id);

      if (task.sectionId !== block.sectionId) {
        violations.push({
          code: VIOLATION_CODES.SECTION_MISMATCH,
          detail: `Task ${task.id} is on a different section from its block`,
        });
      }

      if (blockTask.plannedStart < block.startsAt || blockTask.plannedEnd > block.endsAt) {
        violations.push({
          code: VIOLATION_CODES.TASK_OUTSIDE_BLOCK,
          detail: `Task ${task.id} is scheduled outside the bounds of its block`,
        });
      }

      if (task.requiresPowerBlock && !segment?.powerIsolationAvailable) {
        violations.push({
          code: VIOLATION_CODES.POWER_ISOLATION_MISSING,
          detail: `Task ${task.id} needs power isolation, which this window does not provide`,
        });
      }

      if (task.requiresDisconnection && !segment?.signallingDisconnectionAvailable) {
        violations.push({
          code: VIOLATION_CODES.DISCONNECTION_MISSING,
          detail:
            `Task ${task.id} needs a signalling disconnection, which this window does not provide`,
        });
      }

      if (!perDepartmentIntervals.has(task.department)) {
        perDepartmentIntervals.set(task.department, []);
      }

      perDepartmentIntervals.get(task.department).push({
        taskId: task.id,
        start: blockTask.plannedStart,
        end: blockTask.plannedEnd,
      });
    }

    // Within one department the same gang cannot be in two places at once.
    for (const [department, intervals] of perDepartmentIntervals) {
      const sorted = [...intervals].sort((a, b) => a.start - b.start);

      for (let index = 1; index < sorted.length; index += 1) {
        if (overlaps(sorted[index - 1], sorted[index])) {
          violations.push({
            code: VIOLATION_CODES.DEPARTMENT_OVERLAP,
            detail:
              `${department} tasks ${sorted[index - 1].taskId} and ${sorted[index].taskId} ` +
              'overlap inside the same block',
          });
        }
      }
    }
  }

  return { valid: violations.length === 0, violations };
}
