/**
 * Duration prediction.
 *
 * Block feasibility is decided on the P90, not the median: a block that only
 * fits the typical job overruns one time in two, and an overrun on a live
 * railway means a late hand-back, not a late ticket. Where history is too thin
 * to be meaningful we say so and fall back to the requested duration plus an
 * explicit safety buffer.
 */

export const DURATION_CONFIG = {
  /** Minimum samples before the historical distribution is trusted. */
  minSamples: 5,
  /** Fallback buffer applied to the requested duration, as a fraction. */
  fallbackBufferFraction: 0.25,
  /** Fallback buffer floor, in minutes. */
  fallbackBufferMinimumMinutes: 15,
  /** Predicted durations are rounded up to this granularity. */
  roundingMinutes: 5,
};

function roundUpTo(value, granularity) {
  return Math.ceil(value / granularity) * granularity;
}

/**
 * Nearest-rank percentile on a sorted ascending array.
 * Nearest-rank is used rather than interpolation so a small sample cannot
 * invent a value that never actually occurred.
 */
export function percentile(sortedValues, fraction) {
  if (sortedValues.length === 0) {
    return null;
  }

  const rank = Math.ceil(fraction * sortedValues.length);
  const index = Math.min(Math.max(rank - 1, 0), sortedValues.length - 1);

  return sortedValues[index];
}

export function median(sortedValues) {
  if (sortedValues.length === 0) {
    return null;
  }

  const middle = Math.floor(sortedValues.length / 2);

  return sortedValues.length % 2 === 0
    ? (sortedValues[middle - 1] + sortedValues[middle]) / 2
    : sortedValues[middle];
}

/**
 * Builds a lookup of duration statistics keyed by `TASK_TYPE|DEPARTMENT`, with
 * a department-level fallback bucket keyed by `*|DEPARTMENT`.
 *
 * @param {Array<{taskType: string, department: string, actualDurationMinutes: number}>} history
 */
export function buildDurationIndex(history) {
  const byExact = new Map();
  const ratiosByDepartment = new Map();

  for (const row of history) {
    const minutes = Number(row.actualDurationMinutes);
    const requested = Number(row.requestedDurationMinutes);

    if (!Number.isFinite(minutes) || minutes <= 0) {
      continue;
    }

    const exactKey = `${row.taskType}|${row.department}`;

    if (!byExact.has(exactKey)) byExact.set(exactKey, []);
    byExact.get(exactKey).push(minutes);

    // The department bucket stores overrun RATIOS, not raw minutes. A P90 in
    // raw minutes is dominated by whichever task type happens to be longest,
    // which would wildly over-reserve a short job. The ratio is dimensionless
    // and transfers across task types of different sizes.
    if (Number.isFinite(requested) && requested > 0) {
      if (!ratiosByDepartment.has(row.department)) ratiosByDepartment.set(row.department, []);
      ratiosByDepartment.get(row.department).push(minutes / requested);
    }
  }

  const summariseMinutes = (values) => {
    const sorted = [...values].sort((a, b) => a - b);

    return {
      sampleCount: sorted.length,
      medianMinutes: median(sorted),
      p90Minutes: percentile(sorted, 0.9),
    };
  };

  const summariseRatios = (values) => {
    const sorted = [...values].sort((a, b) => a - b);

    return {
      sampleCount: sorted.length,
      medianRatio: median(sorted),
      p90Ratio: percentile(sorted, 0.9),
    };
  };

  return {
    exact: new Map([...byExact].map(([key, values]) => [key, summariseMinutes(values)])),
    department: new Map(
      [...ratiosByDepartment].map(([key, values]) => [key, summariseRatios(values)]),
    ),
  };
}

/**
 * Predicts the duration to reserve for one task.
 *
 * @returns {{
 *   predictedMinutes: number,
 *   requestedMinutes: number,
 *   medianMinutes: number|null,
 *   p90Minutes: number|null,
 *   sampleCount: number,
 *   source: 'HISTORY_P90'|'DEPARTMENT_OVERRUN_P90'|'REQUESTED_PLUS_BUFFER',
 *   explanation: string
 * }}
 */
export function predictDuration(task, index) {
  const requestedMinutes = Number(task.requestedDurationMinutes) || 0;
  const exact = index.exact.get(`${task.taskType}|${task.department}`);

  if (exact && exact.sampleCount >= DURATION_CONFIG.minSamples) {
    const predicted = roundUpTo(
      Math.max(exact.p90Minutes, requestedMinutes),
      DURATION_CONFIG.roundingMinutes,
    );

    return {
      predictedMinutes: predicted,
      requestedMinutes,
      medianMinutes: exact.medianMinutes,
      p90Minutes: exact.p90Minutes,
      sampleCount: exact.sampleCount,
      source: 'HISTORY_P90',
      explanation:
        `P90 of ${exact.sampleCount} historical ${task.taskType} jobs ` +
        `(median ${exact.medianMinutes} min, P90 ${exact.p90Minutes} min)`,
    };
  }

  const departmentStats = index.department.get(task.department);

  if (departmentStats && departmentStats.sampleCount >= DURATION_CONFIG.minSamples) {
    // Scale this task's own requested duration by how much this department
    // typically overruns, rather than importing another task type's minutes.
    const p90Minutes = requestedMinutes * departmentStats.p90Ratio;

    return {
      predictedMinutes: roundUpTo(
        Math.max(p90Minutes, requestedMinutes),
        DURATION_CONFIG.roundingMinutes,
      ),
      requestedMinutes,
      medianMinutes: Math.round(requestedMinutes * departmentStats.medianRatio),
      p90Minutes: Math.round(p90Minutes),
      sampleCount: departmentStats.sampleCount,
      source: 'DEPARTMENT_OVERRUN_P90',
      explanation:
        `No history for ${task.taskType}; scaled the requested ${requestedMinutes} min by the ` +
        `${task.department} P90 overrun ratio of ${departmentStats.p90Ratio.toFixed(2)}x ` +
        `(${departmentStats.sampleCount} jobs)`,
    };
  }

  const buffer = Math.max(
    requestedMinutes * DURATION_CONFIG.fallbackBufferFraction,
    DURATION_CONFIG.fallbackBufferMinimumMinutes,
  );

  return {
    predictedMinutes: roundUpTo(requestedMinutes + buffer, DURATION_CONFIG.roundingMinutes),
    requestedMinutes,
    medianMinutes: null,
    p90Minutes: null,
    sampleCount: exact?.sampleCount ?? 0,
    source: 'REQUESTED_PLUS_BUFFER',
    explanation:
      `Insufficient history (${exact?.sampleCount ?? 0} samples); used the requested ` +
      `${requestedMinutes} min plus a ${Math.round(buffer)} min safety buffer`,
  };
}
