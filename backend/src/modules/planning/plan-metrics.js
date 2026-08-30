/**
 * Turns solver assignments into concrete blocks and computes the plan metrics.
 *
 * Every number here is derived from the assignments actually produced. Nothing
 * is hard-coded, and the same functions run for the optimized and the baseline
 * plan so the comparison is like for like.
 */

const DEPARTMENT_ORDER = ['ENG', 'TRD', 'SNT'];

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Places each assigned task on a real clock.
 *
 * Departments work concurrently inside one block, so each department's queue
 * starts at the block start and runs sequentially within itself. The block ends
 * when the slowest department finishes, not when the sum of all work would.
 */
export function assembleBlocks({ assignments, tasks, segments }) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));

  const bySegment = new Map();

  for (const assignment of assignments) {
    if (!bySegment.has(assignment.segmentId)) bySegment.set(assignment.segmentId, []);
    bySegment.get(assignment.segmentId).push(assignment);
  }

  const blocks = [];

  const orderedSegmentIds = [...bySegment.keys()].sort((a, b) => {
    const segmentA = segmentById.get(a);
    const segmentB = segmentById.get(b);
    return segmentA.start - segmentB.start || a.localeCompare(b);
  });

  for (const segmentId of orderedSegmentIds) {
    const segment = segmentById.get(segmentId);
    const segmentAssignments = bySegment.get(segmentId);

    const departmentQueues = new Map();

    for (const assignment of segmentAssignments) {
      const task = taskById.get(assignment.taskId);
      if (!departmentQueues.has(task.department)) departmentQueues.set(task.department, []);
      departmentQueues.get(task.department).push({ task, assignment });
    }

    const blockTasks = [];
    let blockEnd = segment.start;

    for (const department of DEPARTMENT_ORDER) {
      const queue = departmentQueues.get(department);

      if (!queue) {
        continue;
      }

      // Deterministic order within a department: urgent work first.
      queue.sort((a, b) => {
        if (a.task.safetyCritical !== b.task.safetyCritical) {
          return a.task.safetyCritical ? -1 : 1;
        }

        if (b.task.priorityScore !== a.task.priorityScore) {
          return b.task.priorityScore - a.task.priorityScore;
        }

        return a.task.id.localeCompare(b.task.id);
      });

      let cursor = segment.start;

      queue.forEach((entry, index) => {
        const durationMs = entry.task.predictedDurationMinutes * 60_000;
        const plannedStart = cursor;
        const plannedEnd = cursor + durationMs;

        blockTasks.push({
          maintenanceTaskId: entry.task.id,
          department,
          plannedStart,
          plannedEnd,
          sequenceNumber: index + 1,
          assignmentReason: {
            reason: entry.assignment.reason ?? 'Assigned by the optimizer',
            predictedDurationMinutes: entry.task.predictedDurationMinutes,
            priorityScore: entry.task.priorityScore,
            prioritySource: entry.task.prioritySource,
            sharesBlockWith: [...departmentQueues.keys()].filter((item) => item !== department),
          },
        });

        cursor = plannedEnd;
      });

      blockEnd = Math.max(blockEnd, cursor);
    }

    const departments = [...departmentQueues.keys()].sort(
      (a, b) => DEPARTMENT_ORDER.indexOf(a) - DEPARTMENT_ORDER.indexOf(b),
    );

    const durationMinutes = (blockEnd - segment.start) / 60_000;
    const usedFraction = segment.durationMinutes > 0 ? durationMinutes / segment.durationMinutes : 0;

    const requiresPower = blockTasks.some(
      (blockTask) => taskById.get(blockTask.maintenanceTaskId).requiresPowerBlock,
    );
    const requiresDisconnection = blockTasks.some(
      (blockTask) => taskById.get(blockTask.maintenanceTaskId).requiresDisconnection,
    );

    let blockType = 'LINE';

    if (departments.length > 1) {
      blockType = 'INTEGRATED';
    } else if (requiresPower) {
      blockType = 'POWER';
    } else if (requiresDisconnection) {
      blockType = 'DISCONNECTION';
    }

    blocks.push({
      blockWindowId: segment.blockWindowId,
      segmentId: segment.id,
      corridorId: segment.corridorId,
      sectionId: segment.sectionId,
      startsAt: segment.start,
      endsAt: blockEnd,
      durationMinutes,
      blockType,
      departments,
      utilizationPercentage: round(usedFraction * 100),
      // The forecast impact of the segment, charged in proportion to how much
      // of it the block actually occupies.
      trainImpactScore: round(segment.impactScore * Math.min(1, usedFraction), 3),
      removedByTrains: segment.removedByTrains,
      tasks: blockTasks,
    });
  }

  return blocks;
}

/**
 * Asset availability across the horizon.
 *
 * availability % =
 *   ((horizon minutes x section count) - unavailable section minutes)
 *   / (horizon minutes x section count) x 100
 *
 * A block makes exactly one section unavailable for its own duration.
 */
export function calculateAssetAvailability({ blocks, horizon, sectionCount }) {
  const horizonMinutes = (horizon.end - horizon.start) / 60_000;
  const denominator = horizonMinutes * sectionCount;

  if (denominator <= 0) {
    return 0;
  }

  const unavailableMinutes = blocks.reduce((total, block) => total + block.durationMinutes, 0);

  return round(((denominator - unavailableMinutes) / denominator) * 100, 3);
}

export function calculatePlanMetrics({ blocks, tasks, unscheduled, horizon, sectionCount }) {
  const scheduledTaskIds = new Set(
    blocks.flatMap((block) => block.tasks.map((task) => task.maintenanceTaskId)),
  );

  const taskById = new Map(tasks.map((task) => [task.id, task]));

  const criticalScheduled = [...scheduledTaskIds].filter(
    (taskId) => taskById.get(taskId)?.severity === 'CRITICAL',
  ).length;

  const criticalUnscheduled = [...unscheduled.keys()].filter(
    (taskId) => taskById.get(taskId)?.severity === 'CRITICAL',
  ).length;

  const totalBlockMinutes = blocks.reduce((total, block) => total + block.durationMinutes, 0);

  const multiDepartmentBlocks = blocks.filter((block) => block.departments.length > 1).length;

  return {
    totalTasks: tasks.length,
    scheduledTasks: scheduledTaskIds.size,
    unscheduledTasks: unscheduled.size,
    criticalTasksScheduled: criticalScheduled,
    criticalTasksUnscheduled: criticalUnscheduled,
    totalBlockCount: blocks.length,
    totalBlockMinutes: Math.round(totalBlockMinutes),
    tasksPerBlock: blocks.length > 0 ? round(scheduledTaskIds.size / blocks.length) : 0,
    multiDepartmentBlockCount: multiDepartmentBlocks,
    trainImpactScore: round(
      blocks.reduce((total, block) => total + block.trainImpactScore, 0),
      3,
    ),
    assetAvailabilityPercentage: calculateAssetAvailability({ blocks, horizon, sectionCount }),
    averageUtilizationPercentage:
      blocks.length > 0
        ? round(
            blocks.reduce((total, block) => total + block.utilizationPercentage, 0) / blocks.length,
          )
        : 0,
  };
}

/**
 * Builds the optimized-versus-baseline comparison.
 *
 * `higherIsBetter` is recorded per metric so the UI never has to guess, and
 * critical coverage is never presented as an improvement just because the plan
 * used fewer block minutes.
 */
export function comparePlans(optimized, baseline) {
  const METRICS = [
    { key: 'scheduledTasks', label: 'Scheduled tasks', higherIsBetter: true },
    { key: 'criticalTasksScheduled', label: 'Critical tasks scheduled', higherIsBetter: true },
    { key: 'criticalTasksUnscheduled', label: 'Unscheduled critical tasks', higherIsBetter: false },
    { key: 'unscheduledTasks', label: 'Unscheduled tasks', higherIsBetter: false },
    { key: 'totalBlockCount', label: 'Total blocks', higherIsBetter: false },
    { key: 'totalBlockMinutes', label: 'Total block minutes', higherIsBetter: false },
    { key: 'tasksPerBlock', label: 'Tasks per block', higherIsBetter: true },
    { key: 'multiDepartmentBlockCount', label: 'Multi-department blocks', higherIsBetter: true },
    { key: 'trainImpactScore', label: 'Train impact score', higherIsBetter: false },
    {
      key: 'assetAvailabilityPercentage',
      label: 'Asset availability %',
      higherIsBetter: true,
    },
  ];

  return METRICS.map((metric) => {
    const optimizedValue = Number(optimized[metric.key] ?? 0);
    const baselineValue = Number(baseline[metric.key] ?? 0);
    const delta = round(optimizedValue - baselineValue, 3);

    let improved = null;

    if (delta !== 0) {
      improved = metric.higherIsBetter ? delta > 0 : delta < 0;
    }

    return {
      ...metric,
      optimized: optimizedValue,
      baseline: baselineValue,
      delta,
      // null means "no change", which is not the same as "no improvement".
      improved,
    };
  });
}
