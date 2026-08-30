import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildBaselinePlan } from '../src/modules/planning/baseline-planner.js';
import { solveGreedy, solveWithFallback } from '../src/modules/planning/fallback-solver.js';
import { solveWithGlpk } from '../src/modules/planning/glpk-solver.js';
import {
  assembleBlocks,
  calculateAssetAvailability,
  calculatePlanMetrics,
  comparePlans,
} from '../src/modules/planning/plan-metrics.js';
import { VIOLATION_CODES, validatePlan } from '../src/modules/planning/plan-validator.js';

const MINUTE = 60_000;
const at = (minutes) => minutes * MINUTE;

/**
 * A small, fully deterministic scenario: one section, one three-hour window,
 * and one task from each department, all of which fit concurrently.
 */
function buildScenario() {
  const segment = {
    id: 'SEG1',
    blockWindowId: 'W1',
    corridorId: 'C1',
    sectionId: 'S1',
    start: at(19 * 60),
    end: at(22 * 60),
    durationMinutes: 180,
    powerIsolationAvailable: true,
    signallingDisconnectionAvailable: true,
    availableLineCount: 1,
    confidence: 0.9,
    removedByTrains: [],
    impactScore: 2,
  };

  const tasks = [
    {
      id: 'T-ENG',
      department: 'ENG',
      sectionId: 'S1',
      severity: 'HIGH',
      safetyCritical: false,
      priorityScore: 70,
      prioritySource: 'ML',
      predictedDurationMinutes: 90,
      requiresPowerBlock: false,
      requiresDisconnection: false,
      earliestStartMs: at(0),
      dueAtMs: at(48 * 60),
    },
    {
      id: 'T-TRD',
      department: 'TRD',
      sectionId: 'S1',
      severity: 'MEDIUM',
      safetyCritical: false,
      priorityScore: 50,
      prioritySource: 'ML',
      predictedDurationMinutes: 120,
      requiresPowerBlock: true,
      requiresDisconnection: false,
      earliestStartMs: at(0),
      dueAtMs: at(72 * 60),
    },
    {
      id: 'T-SNT',
      department: 'SNT',
      sectionId: 'S1',
      severity: 'CRITICAL',
      safetyCritical: true,
      priorityScore: 95,
      prioritySource: 'ML',
      predictedDurationMinutes: 60,
      requiresPowerBlock: false,
      requiresDisconnection: true,
      earliestStartMs: at(0),
      dueAtMs: at(24 * 60),
    },
  ];

  const options = tasks.map((task) => ({
    taskId: task.id,
    segmentId: segment.id,
    segment,
    impactScore: segment.impactScore,
    utilisation: task.predictedDurationMinutes / segment.durationMinutes,
  }));

  return { segment, segments: [segment], tasks, options, rejections: new Map() };
}

const HORIZON = { start: at(0), end: at(7 * 24 * 60), type: 'WEEKLY' };

describe('GLPK solver', () => {
  it('solves a small feasible case and bundles all three departments into one block', async () => {
    const scenario = buildScenario();

    const result = await solveWithGlpk({
      tasks: scenario.tasks,
      options: scenario.options,
      segments: scenario.segments,
      timeLimitSeconds: 10,
    });

    assert.ok(
      result.status === 'OPTIMAL' || result.status === 'FEASIBLE',
      `expected a solved status, got ${result.status} (${result.error ?? 'no error'})`,
    );

    assert.equal(result.assignments.length, 3, 'all three tasks fit concurrently');
    assert.equal(new Set(result.assignments.map((a) => a.segmentId)).size, 1, 'one shared block');
  });

  it('reports INFEASIBLE rather than inventing a plan when there are no options', async () => {
    const result = await solveWithGlpk({ tasks: [], options: [], segments: [] });

    assert.equal(result.status, 'INFEASIBLE');
    assert.deepEqual(result.assignments, []);
  });

  it('queues same-department work rather than overlapping it', async () => {
    const scenario = buildScenario();

    // Two ENG jobs of 120 minutes cannot both fit a 180-minute window.
    const tasks = [
      { ...scenario.tasks[0], id: 'E1', predictedDurationMinutes: 120 },
      { ...scenario.tasks[0], id: 'E2', predictedDurationMinutes: 120, priorityScore: 60 },
    ];

    const options = tasks.map((task) => ({
      taskId: task.id,
      segmentId: scenario.segment.id,
      segment: scenario.segment,
      impactScore: 2,
      utilisation: 0.66,
    }));

    const result = await solveWithGlpk({ tasks, options, segments: scenario.segments });

    assert.ok(result.assignments.length <= 1, 'the department capacity constraint must bind');
  });
});

describe('greedy fallback solver', () => {
  it('places every task that fits and reports FALLBACK_FEASIBLE', () => {
    const scenario = buildScenario();
    const result = solveWithFallback(scenario);

    assert.equal(result.status, 'FALLBACK_FEASIBLE');
    assert.equal(result.assignments.length, 3);
  });

  it('orders safety-critical work first', () => {
    const scenario = buildScenario();
    const { assignments } = solveGreedy({ ...scenario, allowBundling: true });

    assert.equal(assignments[0].taskId, 'T-SNT', 'the safety-critical task must be placed first');
  });

  it('leaves a task unscheduled with a reason when the window is full', () => {
    const scenario = buildScenario();

    const tasks = [
      { ...scenario.tasks[0], id: 'E1', predictedDurationMinutes: 120 },
      { ...scenario.tasks[0], id: 'E2', predictedDurationMinutes: 120, priorityScore: 10 },
    ];

    const options = tasks.map((task) => ({
      taskId: task.id,
      segmentId: scenario.segment.id,
      segment: scenario.segment,
      impactScore: 2,
      utilisation: 0.66,
    }));

    const { assignments, unscheduled } = solveGreedy({
      tasks,
      options,
      rejections: new Map(),
      allowBundling: true,
    });

    assert.equal(assignments.length, 1);
    assert.equal(unscheduled.size, 1);
    assert.equal(unscheduled.get('E2').reasonCode, 'INSUFFICIENT_DURATION');
  });

  it('is deterministic across repeated runs', () => {
    const first = solveGreedy({ ...buildScenario(), allowBundling: true });
    const second = solveGreedy({ ...buildScenario(), allowBundling: true });

    assert.deepEqual(
      first.assignments.map((a) => a.taskId),
      second.assignments.map((a) => a.taskId),
    );
  });
});

describe('baseline planner', () => {
  it('never bundles departments, so a shared window serves only one of them', () => {
    const scenario = buildScenario();
    const result = buildBaselinePlan(scenario);

    assert.equal(result.assignments.length, 1, 'only the first department claims the window');
    assert.equal(result.assignments[0].taskId, 'T-ENG', 'departments are planned ENG, TRD, SNT');

    // The other two are explained, not silently dropped.
    assert.equal(result.unscheduled.size, 2);

    for (const [, reason] of result.unscheduled) {
      assert.equal(reason.reasonCode, 'INCOMPATIBLE_TASK');
    }
  });

  it('schedules strictly fewer or equal tasks than the coordinated planner', () => {
    const baseline = buildBaselinePlan(buildScenario());
    const optimized = solveWithFallback(buildScenario());

    assert.ok(baseline.assignments.length <= optimized.assignments.length);
  });
});

describe('block assembly and metrics', () => {
  it('runs departments concurrently, so the block is as long as the slowest one', () => {
    const scenario = buildScenario();
    const { assignments } = solveWithFallback(scenario);

    const blocks = assembleBlocks({
      assignments,
      tasks: scenario.tasks,
      segments: scenario.segments,
    });

    assert.equal(blocks.length, 1);
    // Slowest department is TRD at 120 minutes; the sum would have been 270.
    assert.equal(blocks[0].durationMinutes, 120);
    assert.equal(blocks[0].blockType, 'INTEGRATED');
    assert.deepEqual([...blocks[0].departments].sort(), ['ENG', 'SNT', 'TRD']);
  });

  it('starts every department queue at the block start', () => {
    const scenario = buildScenario();
    const { assignments } = solveWithFallback(scenario);
    const [block] = assembleBlocks({ assignments, tasks: scenario.tasks, segments: scenario.segments });

    for (const task of block.tasks) {
      assert.equal(task.plannedStart, block.startsAt, `${task.department} must start at block start`);
    }
  });

  it('computes asset availability from the documented formula', () => {
    // 2 sections over a 1000-minute horizon, with 100 minutes blocked.
    const availability = calculateAssetAvailability({
      blocks: [{ durationMinutes: 100 }],
      horizon: { start: 0, end: at(1000) },
      sectionCount: 2,
    });

    // (1000 * 2 - 100) / (1000 * 2) * 100 = 95
    assert.equal(availability, 95);
  });

  it('returns 100% availability when nothing is blocked', () => {
    const availability = calculateAssetAvailability({
      blocks: [],
      horizon: { start: 0, end: at(1000) },
      sectionCount: 3,
    });

    assert.equal(availability, 100);
  });

  it('counts scheduled, critical and multi-department figures from the blocks themselves', () => {
    const scenario = buildScenario();
    const { assignments } = solveWithFallback(scenario);
    const blocks = assembleBlocks({ assignments, tasks: scenario.tasks, segments: scenario.segments });

    const metrics = calculatePlanMetrics({
      blocks,
      tasks: scenario.tasks,
      unscheduled: new Map(),
      horizon: HORIZON,
      sectionCount: 1,
    });

    assert.equal(metrics.scheduledTasks, 3);
    assert.equal(metrics.criticalTasksScheduled, 1);
    assert.equal(metrics.multiDepartmentBlockCount, 1);
    assert.equal(metrics.totalBlockCount, 1);
    assert.equal(metrics.tasksPerBlock, 3);
  });
});

describe('plan comparison', () => {
  const optimized = {
    scheduledTasks: 30,
    criticalTasksScheduled: 14,
    criticalTasksUnscheduled: 4,
    unscheduledTasks: 66,
    totalBlockCount: 19,
    totalBlockMinutes: 2050,
    tasksPerBlock: 1.58,
    multiDepartmentBlockCount: 9,
    trainImpactScore: 261,
    assetAvailabilityPercentage: 97.9,
  };

  const baseline = {
    scheduledTasks: 27,
    criticalTasksScheduled: 9,
    criticalTasksUnscheduled: 9,
    unscheduledTasks: 69,
    totalBlockCount: 27,
    totalBlockMinutes: 2955,
    tasksPerBlock: 1,
    multiDepartmentBlockCount: 0,
    trainImpactScore: 457,
    assetAvailabilityPercentage: 97.0,
  };

  it('marks a fall in block minutes as an improvement', () => {
    const row = comparePlans(optimized, baseline).find((item) => item.key === 'totalBlockMinutes');

    assert.equal(row.delta, -905);
    assert.equal(row.improved, true);
  });

  it('marks a fall in critical coverage as a regression, not an improvement', () => {
    const worse = comparePlans({ ...optimized, criticalTasksScheduled: 5 }, baseline).find(
      (item) => item.key === 'criticalTasksScheduled',
    );

    assert.equal(worse.delta, -4);
    assert.equal(worse.improved, false);
  });

  it('reports no change as null rather than as an improvement', () => {
    const row = comparePlans(optimized, optimized).find((item) => item.key === 'scheduledTasks');

    assert.equal(row.delta, 0);
    assert.equal(row.improved, null);
  });
});

describe('independent plan validator', () => {
  function validScenarioBlocks() {
    const scenario = buildScenario();
    const { assignments } = solveWithFallback(scenario);

    return {
      scenario,
      blocks: assembleBlocks({ assignments, tasks: scenario.tasks, segments: scenario.segments }),
    };
  }

  it('accepts a plan built by the solvers', () => {
    const { scenario, blocks } = validScenarioBlocks();

    const result = validatePlan({
      blocks,
      tasks: scenario.tasks,
      segments: scenario.segments,
      movements: [],
      horizon: HORIZON,
      trainBufferMinutes: 10,
    });

    assert.equal(result.valid, true, JSON.stringify(result.violations));
  });

  it('rejects a block that overlaps a protected train inside the buffer', () => {
    const { scenario, blocks } = validScenarioBlocks();

    const result = validatePlan({
      blocks,
      tasks: scenario.tasks,
      segments: scenario.segments,
      movements: [
        {
          sectionId: 'S1',
          trainNumber: '12002',
          protected: true,
          // Ends five minutes before the block starts, which the 10-minute
          // buffer must still catch.
          start: at(19 * 60 - 30),
          end: at(19 * 60 - 5),
        },
      ],
      horizon: HORIZON,
      trainBufferMinutes: 10,
    });

    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.code === VIOLATION_CODES.TRAIN_CONFLICT));
  });

  it('rejects a duplicate task assignment', () => {
    const { scenario, blocks } = validScenarioBlocks();
    const duplicated = [blocks[0], { ...blocks[0] }];

    const result = validatePlan({
      blocks: duplicated,
      tasks: scenario.tasks,
      segments: scenario.segments,
      movements: [],
      horizon: HORIZON,
      trainBufferMinutes: 10,
    });

    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.code === VIOLATION_CODES.DUPLICATE_TASK));
  });

  it('rejects a block that falls outside the horizon', () => {
    const { scenario, blocks } = validScenarioBlocks();

    const result = validatePlan({
      blocks,
      tasks: scenario.tasks,
      segments: scenario.segments,
      movements: [],
      horizon: { start: at(0), end: at(60), type: 'WEEKLY' },
      trainBufferMinutes: 10,
    });

    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.code === VIOLATION_CODES.BLOCK_OUTSIDE_HORIZON));
  });

  it('rejects power-block work placed in a window without isolation', () => {
    const { scenario, blocks } = validScenarioBlocks();

    const segments = [{ ...scenario.segments[0], powerIsolationAvailable: false }];

    const result = validatePlan({
      blocks,
      tasks: scenario.tasks,
      segments,
      movements: [],
      horizon: HORIZON,
      trainBufferMinutes: 10,
    });

    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.code === VIOLATION_CODES.POWER_ISOLATION_MISSING));
  });

  it('rejects disconnection work placed in a window without disconnection', () => {
    const { scenario, blocks } = validScenarioBlocks();

    const segments = [{ ...scenario.segments[0], signallingDisconnectionAvailable: false }];

    const result = validatePlan({
      blocks,
      tasks: scenario.tasks,
      segments,
      movements: [],
      horizon: HORIZON,
      trainBufferMinutes: 10,
    });

    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.code === VIOLATION_CODES.DISCONNECTION_MISSING));
  });

  it('rejects two tasks of one department overlapping inside a block', () => {
    const { scenario, blocks } = validScenarioBlocks();

    const tampered = [
      {
        ...blocks[0],
        tasks: [
          { ...blocks[0].tasks[0], plannedStart: at(19 * 60), plannedEnd: at(20 * 60) },
          {
            // Same department, same time.
            ...blocks[0].tasks[0],
            maintenanceTaskId: 'T-ENG-2',
            plannedStart: at(19 * 60 + 10),
            plannedEnd: at(20 * 60),
          },
        ],
      },
    ];

    const tasks = [...scenario.tasks, { ...scenario.tasks[0], id: 'T-ENG-2' }];

    const result = validatePlan({
      blocks: tampered,
      tasks,
      segments: scenario.segments,
      movements: [],
      horizon: HORIZON,
      trainBufferMinutes: 10,
    });

    assert.equal(result.valid, false);
    assert.ok(result.violations.some((v) => v.code === VIOLATION_CODES.DEPARTMENT_OVERLAP));
  });
});
