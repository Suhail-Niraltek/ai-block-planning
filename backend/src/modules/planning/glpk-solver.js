// The package root export is the browser build and expects a Web Worker, which
// does not exist in Node. `glpk.js/node` is the synchronous WASM build.
import createGlpk from 'glpk.js/node';

/**
 * Block optimizer, formulated as a mixed-integer program and solved with GLPK.
 *
 * Decision variables
 *   x[t,s] = 1 when task t is carried out inside candidate segment s
 *   y[s]   = 1 when segment s is used as a block at all
 *   d[s,p] = 1 when department p is present in the block on segment s
 *
 * Modelling note on capacity: tasks belonging to DIFFERENT departments work
 * concurrently during one block, which is the whole point of an integrated
 * block. Tasks of the SAME department on the same stretch must queue. So the
 * capacity constraint is applied per department, not across the whole block.
 */

export const OBJECTIVE_WEIGHTS = {
  /** Multiplies the 0-100 priority score. Dominates everything else. */
  risk: 10,
  /** Flat bonus for a safety-critical task, so it outranks any bundling gain. */
  safetyCritical: 2000,
  /** Cost per hour of block taken. This is the downtime term. */
  blockHour: 30,
  /** Cost per unit of forecast train impact. */
  impact: 6,
  /** Bonus for each department beyond the first sharing one block. */
  bundling: 25,
  /** Small bonus per scheduled task, breaking ties toward doing more work. */
  taskScheduled: 10,
};

const DEPARTMENTS = ['ENG', 'TRD', 'SNT'];

function variableName(prefix, ...parts) {
  return `${prefix}_${parts.join('_')}`;
}

/**
 * Builds the LP structure. Exported so it can be unit-tested without invoking
 * the solver binary.
 */
export function buildProgram({ tasks, options, segments }, glpk) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));

  // Index every variable up front so names stay stable and referenceable.
  const optionVars = options.map((option, index) => ({
    ...option,
    name: variableName('x', index),
  }));

  const usedSegmentIds = [...new Set(optionVars.map((option) => option.segmentId))];
  const segmentVarName = new Map(
    usedSegmentIds.map((segmentId, index) => [segmentId, variableName('y', index)]),
  );

  const departmentVarName = new Map();

  usedSegmentIds.forEach((segmentId, segmentIndex) => {
    DEPARTMENTS.forEach((department, departmentIndex) => {
      departmentVarName.set(
        `${segmentId}|${department}`,
        variableName('d', segmentIndex, departmentIndex),
      );
    });
  });

  const objectiveVars = [];
  const subjectTo = [];

  for (const option of optionVars) {
    const task = taskById.get(option.taskId);

    // Per-task value only. The cost of taking the block is charged once, on the
    // segment variable below - charging it per task would double-count the same
    // disruption and penalise exactly the bundling this optimizer exists to find.
    const coefficient =
      OBJECTIVE_WEIGHTS.risk * Number(task.priorityScore) +
      (task.safetyCritical ? OBJECTIVE_WEIGHTS.safetyCritical : 0) +
      OBJECTIVE_WEIGHTS.taskScheduled;

    objectiveVars.push({ name: option.name, coef: coefficient });
  }

  for (const segmentId of usedSegmentIds) {
    const segment = segmentById.get(segmentId);
    const hours = segment.durationMinutes / 60;

    // Taking a block costs its downtime plus its operational impact on traffic,
    // both charged once however many tasks end up sharing it.
    objectiveVars.push({
      name: segmentVarName.get(segmentId),
      coef:
        -OBJECTIVE_WEIGHTS.blockHour * hours -
        OBJECTIVE_WEIGHTS.impact * Number(segment.impactScore),
    });

    // Rewarding every present department and charging back one per used block
    // leaves a net bonus of (departments - 1), which is exactly the bundling gain.
    for (const department of DEPARTMENTS) {
      objectiveVars.push({
        name: departmentVarName.get(`${segmentId}|${department}`),
        coef: OBJECTIVE_WEIGHTS.bundling,
      });
    }

    objectiveVars.push({
      name: segmentVarName.get(segmentId),
      coef: -OBJECTIVE_WEIGHTS.bundling,
    });
  }

  // Constraint 1: each task is scheduled at most once.
  const optionsByTask = new Map();

  for (const option of optionVars) {
    if (!optionsByTask.has(option.taskId)) optionsByTask.set(option.taskId, []);
    optionsByTask.get(option.taskId).push(option);
  }

  for (const [taskId, taskOptions] of optionsByTask) {
    subjectTo.push({
      name: `once_${taskId.slice(0, 8)}_${taskOptions.length}`,
      vars: taskOptions.map((option) => ({ name: option.name, coef: 1 })),
      bnds: { type: glpk.GLP_UP, ub: 1, lb: 0 },
    });
  }

  // Constraint 2: per-department capacity inside each segment.
  const optionsBySegment = new Map();

  for (const option of optionVars) {
    if (!optionsBySegment.has(option.segmentId)) optionsBySegment.set(option.segmentId, []);
    optionsBySegment.get(option.segmentId).push(option);
  }

  let constraintIndex = 0;

  for (const [segmentId, segmentOptions] of optionsBySegment) {
    const segment = segmentById.get(segmentId);

    for (const department of DEPARTMENTS) {
      const departmentOptions = segmentOptions.filter(
        (option) => taskById.get(option.taskId).department === department,
      );

      if (departmentOptions.length === 0) {
        continue;
      }

      subjectTo.push({
        name: `cap_${constraintIndex}`,
        vars: departmentOptions.map((option) => ({
          name: option.name,
          coef: taskById.get(option.taskId).predictedDurationMinutes,
        })),
        bnds: { type: glpk.GLP_UP, ub: segment.durationMinutes, lb: 0 },
      });

      constraintIndex += 1;

      // Constraint 3: department presence is forced up by any assigned task
      // and capped by the total assignments, so it cannot be set for free.
      const departmentVar = departmentVarName.get(`${segmentId}|${department}`);

      for (const option of departmentOptions) {
        subjectTo.push({
          name: `dept_lo_${constraintIndex}_${option.name}`,
          vars: [
            { name: departmentVar, coef: 1 },
            { name: option.name, coef: -1 },
          ],
          bnds: { type: glpk.GLP_LO, lb: 0, ub: 0 },
        });
      }

      subjectTo.push({
        name: `dept_hi_${constraintIndex}`,
        vars: [
          { name: departmentVar, coef: 1 },
          ...departmentOptions.map((option) => ({ name: option.name, coef: -1 })),
        ],
        bnds: { type: glpk.GLP_UP, ub: 0, lb: 0 },
      });

      constraintIndex += 1;
    }

    // Constraint 4: a segment counts as a used block as soon as anything is on it.
    for (const option of segmentOptions) {
      subjectTo.push({
        name: `use_${constraintIndex}_${option.name}`,
        vars: [
          { name: segmentVarName.get(segmentId), coef: 1 },
          { name: option.name, coef: -1 },
        ],
        bnds: { type: glpk.GLP_LO, lb: 0, ub: 0 },
      });
    }

    constraintIndex += 1;
  }

  const binaries = [
    ...optionVars.map((option) => option.name),
    ...usedSegmentIds.map((segmentId) => segmentVarName.get(segmentId)),
    ...usedSegmentIds.flatMap((segmentId) =>
      DEPARTMENTS.map((department) => departmentVarName.get(`${segmentId}|${department}`)),
    ),
  ];

  return {
    program: {
      name: 'block_plan',
      objective: { direction: glpk.GLP_MAX, name: 'value', vars: objectiveVars },
      subjectTo,
      binaries,
    },
    optionVars,
  };
}

function mapStatus(glpk, status) {
  switch (status) {
    case glpk.GLP_OPT:
      return 'OPTIMAL';
    case glpk.GLP_FEAS:
      return 'FEASIBLE';
    case glpk.GLP_INFEAS:
    case glpk.GLP_NOFEAS:
      return 'INFEASIBLE';
    default:
      return 'FAILED';
  }
}

/**
 * Runs the optimizer.
 *
 * @returns {Promise<{ status: string, assignments: Array, objectiveValue: number|null,
 *                     error: string|null }>}
 */
export async function solveWithGlpk({ tasks, options, segments, timeLimitSeconds = 30 }) {
  if (options.length === 0) {
    return { status: 'INFEASIBLE', assignments: [], objectiveValue: null, error: null };
  }

  try {
    const glpk = await createGlpk();
    const { program, optionVars } = buildProgram({ tasks, options, segments }, glpk);

    // The node build solves synchronously; await keeps this agnostic either way.
    const result = await glpk.solve(program, {
      msglev: glpk.GLP_MSG_OFF,
      tmlim: timeLimitSeconds,
      presol: true,
    });

    const status = mapStatus(glpk, result?.result?.status);
    const variables = result?.result?.vars ?? {};

    if (status === 'INFEASIBLE' || status === 'FAILED') {
      return { status, assignments: [], objectiveValue: null, error: null };
    }

    const assignments = optionVars
      // GLPK returns integral values as floats, so compare against a threshold.
      .filter((option) => (variables[option.name] ?? 0) > 0.5)
      .map((option) => ({ taskId: option.taskId, segmentId: option.segmentId }));

    return {
      status,
      assignments,
      objectiveValue: result?.result?.z ?? null,
      error: null,
    };
  } catch (error) {
    return { status: 'FAILED', assignments: [], objectiveValue: null, error: error.message };
  }
}
