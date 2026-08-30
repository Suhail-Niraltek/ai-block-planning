import { env } from '../../config/env.js';
import { withTransaction } from '../../database/connection.js';
import { ApiError } from '../../middleware/api-response.js';
import { buildBaselinePlan } from './baseline-planner.js';
import { buildCandidateOptions, buildUsableSegments } from './candidate-window-engine.js';
import { solveWithFallback } from './fallback-solver.js';
import { solveWithGlpk } from './glpk-solver.js';
import { assembleBlocks, calculatePlanMetrics, comparePlans } from './plan-metrics.js';
import { validatePlan } from './plan-validator.js';
import * as repository from './planning.repository.js';

/** Turns a solver result into stored blocks, metrics, and a safety verdict. */
function buildPlan({ assignments, unscheduled, tasks, segments, movements, horizon, sectionCount }) {
  const blocks = assembleBlocks({ assignments, tasks, segments });

  const validation = validatePlan({
    blocks,
    tasks,
    segments,
    movements,
    horizon,
    trainBufferMinutes: env.planning.trainBufferMinutes,
  });

  // Any task that is neither scheduled nor already explained is recorded now,
  // so no task can silently disappear from the plan.
  const scheduledIds = new Set(
    blocks.flatMap((block) => block.tasks.map((task) => task.maintenanceTaskId)),
  );

  const completeUnscheduled = new Map(unscheduled);

  for (const task of tasks) {
    if (!scheduledIds.has(task.id) && !completeUnscheduled.has(task.id)) {
      completeUnscheduled.set(task.id, {
        reasonCode: 'INSUFFICIENT_DURATION',
        explanation: 'No feasible window remained after higher-priority work was placed',
      });
    }
  }

  const metrics = calculatePlanMetrics({
    blocks,
    tasks,
    unscheduled: completeUnscheduled,
    horizon,
    sectionCount,
  });

  return { blocks, metrics, unscheduled: completeUnscheduled, validation };
}

function horizonBounds({ horizonType, horizonStart, horizonEnd }) {
  const start = Date.parse(horizonStart);
  let end = horizonEnd ? Date.parse(horizonEnd) : null;

  if (!end) {
    if (horizonType === 'WEEKLY') {
      end = start + 7 * 86_400_000;
    } else {
      const startDate = new Date(start);
      end = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, startDate.getUTCDate());
    }
  }

  return { start, end, type: horizonType };
}

/**
 * Runs one planning request end to end.
 *
 * The optimized and baseline plans are built from the identical task set,
 * window set, durations and safety rules, so the comparison isolates the effect
 * of coordinated scheduling and nothing else.
 */
export async function createPlanningRun(request) {
  const horizon = horizonBounds(request);

  if (!Number.isFinite(horizon.start) || !Number.isFinite(horizon.end)) {
    throw ApiError.validation('horizonStart and horizonEnd must be valid instants');
  }

  if (horizon.end <= horizon.start) {
    throw ApiError.validation('horizonEnd must be after horizonStart');
  }

  const runId = await repository.createPlanningRun({
    horizonType: request.horizonType,
    horizonStart: horizon.start,
    horizonEnd: horizon.end,
  });

  const stages = [];

  try {
    stages.push({ stage: 'LOAD_INPUTS', at: new Date().toISOString() });

    const inputs = await repository.loadPlanningInputs({
      horizonStart: horizon.start,
      horizonEnd: horizon.end,
      corridorIds: request.corridorIds,
    });

    if (inputs.tasks.length === 0) {
      throw ApiError.conflict(
        'No maintenance tasks are available to plan. Sync the source systems first.',
      );
    }

    if (inputs.windows.length === 0) {
      throw ApiError.conflict(
        'No corridor block windows fall inside this horizon. Sync COA or choose another horizon.',
      );
    }

    stages.push({ stage: 'BUILD_CANDIDATE_WINDOWS', at: new Date().toISOString() });

    const segments = buildUsableSegments({
      windows: inputs.windows,
      movements: inputs.movements,
      forecasts: inputs.forecasts,
      horizon,
      trainBufferMinutes: env.planning.trainBufferMinutes,
    });

    const { options, rejections } = buildCandidateOptions({
      tasks: inputs.tasks,
      segments,
      horizon,
    });

    stages.push({ stage: 'OPTIMIZE', at: new Date().toISOString() });

    const glpkResult = await solveWithGlpk({
      tasks: inputs.tasks,
      options,
      segments,
      timeLimitSeconds: env.planning.solverTimeLimitSeconds,
    });

    let solverType = 'GLPK';
    let solverStatus = glpkResult.status;
    let assignments = glpkResult.assignments;
    let unscheduled = new Map(rejections);
    let solverNote = null;

    if (solverStatus === 'FAILED' || solverStatus === 'INFEASIBLE' || assignments.length === 0) {
      stages.push({ stage: 'FALLBACK', at: new Date().toISOString() });

      const fallback = solveWithFallback({ tasks: inputs.tasks, options, rejections });

      solverType = 'FALLBACK';
      solverStatus = fallback.status;
      assignments = fallback.assignments;
      unscheduled = fallback.unscheduled;
      solverNote =
        glpkResult.error ??
        'GLPK returned no assignments, so the deterministic greedy planner was used.';
    }

    stages.push({ stage: 'VALIDATE', at: new Date().toISOString() });

    const optimized = buildPlan({
      assignments,
      unscheduled,
      tasks: inputs.tasks,
      segments,
      movements: inputs.movements,
      horizon,
      sectionCount: inputs.sectionCount,
    });

    if (!optimized.validation.valid) {
      // A plan that fails independent validation is never stored.
      throw ApiError.conflict(
        `Plan rejected by the independent validator: ${optimized.validation.violations
          .slice(0, 3)
          .map((violation) => violation.detail)
          .join('; ')}`,
        optimized.validation.violations,
      );
    }

    stages.push({ stage: 'BASELINE', at: new Date().toISOString() });

    const baselineResult = buildBaselinePlan({ tasks: inputs.tasks, options, rejections });

    const baseline = buildPlan({
      assignments: baselineResult.assignments,
      unscheduled: baselineResult.unscheduled,
      tasks: inputs.tasks,
      segments,
      movements: inputs.movements,
      horizon,
      sectionCount: inputs.sectionCount,
    });

    if (!baseline.validation.valid) {
      throw ApiError.conflict(
        `Baseline plan rejected by the independent validator: ${baseline.validation.violations
          .slice(0, 3)
          .map((violation) => violation.detail)
          .join('; ')}`,
        baseline.validation.violations,
      );
    }

    stages.push({ stage: 'PERSIST', at: new Date().toISOString() });

    const { optimizedPlanId, baselinePlanId } = await withTransaction(async (connection) => {
      const optimizedId = await repository.savePlan(connection, {
        runId,
        planType: 'OPTIMIZED',
        horizon,
        metrics: optimized.metrics,
        solverStatus,
        blocks: optimized.blocks,
        unscheduled: optimized.unscheduled,
        tasks: inputs.tasks,
      });

      const baselineId = await repository.savePlan(connection, {
        runId,
        planType: 'BASELINE',
        horizon,
        metrics: baseline.metrics,
        solverStatus: 'FALLBACK_FEASIBLE',
        blocks: baseline.blocks,
        unscheduled: baseline.unscheduled,
        tasks: inputs.tasks,
      });

      await repository.markTasksPlanned(
        connection,
        optimized.blocks.flatMap((block) => block.tasks.map((task) => task.maintenanceTaskId)),
      );

      return { optimizedPlanId: optimizedId, baselinePlanId: baselineId };
    });

    await repository.completePlanningRun(runId, solverType);

    return {
      runId,
      status: 'COMPLETED',
      horizonType: request.horizonType,
      horizonStart: new Date(horizon.start).toISOString(),
      horizonEnd: new Date(horizon.end).toISOString(),
      solverType,
      solverStatus,
      solverNote,
      stages,
      inputs: {
        taskCount: inputs.tasks.length,
        blockWindowCount: inputs.windows.length,
        trainMovementCount: inputs.movements.length,
        protectedMovementCount: inputs.movements.filter((movement) => movement.protected).length,
        goodsForecastBuckets: inputs.forecasts.length,
        usableSegmentCount: segments.length,
        feasibleOptionCount: options.length,
        sectionCount: inputs.sectionCount,
      },
      optimizedPlanId,
      baselinePlanId,
      optimizedMetrics: optimized.metrics,
      baselineMetrics: baseline.metrics,
      comparison: comparePlans(optimized.metrics, baseline.metrics),
      validation: { optimized: optimized.validation, baseline: baseline.validation },
      dataOrigin: 'SYNTHETIC',
    };
  } catch (error) {
    await repository.failPlanningRun(runId, error.message);
    throw error;
  }
}

export function listRuns(limit) {
  return repository.findRuns(limit);
}

export async function getRun(id) {
  const run = await repository.findRunById(id);

  if (!run) {
    throw ApiError.notFound(`Planning run ${id} not found`);
  }

  const plans = await repository.findPlansByRunId(id);

  return { ...run, plans };
}

export async function getPlansForRun(id) {
  await getRun(id);
  return repository.findPlansByRunId(id);
}

function parseJsonColumn(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function getPlan(id) {
  const plan = await repository.findPlanById(id);

  if (!plan) {
    throw ApiError.notFound(`Plan ${id} not found`);
  }

  return plan;
}

export async function getPlanBlocks(id) {
  await getPlan(id);

  const blocks = await repository.findPlanBlocks(id);

  return blocks.map((block) => ({
    ...block,
    departments: parseJsonColumn(block.departments, []),
    tasks: block.tasks.map((task) => ({
      ...task,
      safetyCritical: task.safetyCritical === 1,
      assignmentReason: parseJsonColumn(task.assignmentReason, null),
    })),
  }));
}

export async function getUnscheduledTasks(id) {
  await getPlan(id);

  const rows = await repository.findUnscheduledTasks(id);

  return rows.map((row) => ({ ...row, safetyCritical: row.safetyCritical === 1 }));
}

export async function comparePlanIds(optimizedPlanId, baselinePlanId) {
  const optimized = await getPlan(optimizedPlanId);
  const baseline = await getPlan(baselinePlanId);

  const toMetrics = (plan) => ({
    totalTasks: plan.totalTasks,
    scheduledTasks: plan.scheduledTasks,
    unscheduledTasks: plan.unscheduledTasks,
    criticalTasksScheduled: plan.criticalTasksScheduled,
    criticalTasksUnscheduled: plan.criticalTasksUnscheduled,
    totalBlockCount: plan.totalBlockCount,
    totalBlockMinutes: plan.totalBlockMinutes,
    tasksPerBlock:
      plan.totalBlockCount > 0
        ? Math.round((plan.scheduledTasks / plan.totalBlockCount) * 100) / 100
        : 0,
    multiDepartmentBlockCount: plan.multiDepartmentBlockCount,
    trainImpactScore: Number(plan.trainImpactScore),
    assetAvailabilityPercentage: Number(plan.assetAvailabilityPercentage),
  });

  return {
    optimized: { ...optimized, metrics: toMetrics(optimized) },
    baseline: { ...baseline, metrics: toMetrics(baseline) },
    comparison: comparePlans(toMetrics(optimized), toMetrics(baseline)),
  };
}
