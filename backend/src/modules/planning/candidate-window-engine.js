/**
 * Candidate-window engine.
 *
 * Turns raw COA availability into time that maintenance can actually use, by
 * removing protected train paths, then decides which task/window pairings are
 * feasible and why the rest are not.
 *
 * All intervals are half-open [start, end): a window ending at 22:00 and a train
 * entering at 22:00 do not conflict. Everything is milliseconds since epoch, so
 * no timezone handling leaks into the algorithm.
 */

export const REASON_CODES = {
  NO_BLOCK_WINDOW: 'NO_BLOCK_WINDOW',
  TRAIN_CONFLICT: 'TRAIN_CONFLICT',
  INSUFFICIENT_DURATION: 'INSUFFICIENT_DURATION',
  POWER_ISOLATION_UNAVAILABLE: 'POWER_ISOLATION_UNAVAILABLE',
  DISCONNECTION_UNAVAILABLE: 'DISCONNECTION_UNAVAILABLE',
  INCOMPATIBLE_TASK: 'INCOMPATIBLE_TASK',
  OUTSIDE_HORIZON: 'OUTSIDE_HORIZON',
};

/** Returns true when two half-open intervals share any time at all. */
export function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

export function intersect(a, b) {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);

  return end > start ? { start, end } : null;
}

/**
 * Removes every blocking interval from `base`, returning the surviving pieces.
 * Blockers may overlap each other and need not be sorted.
 */
export function subtractIntervals(base, blockers) {
  if (base.end <= base.start) {
    return [];
  }

  const relevant = blockers
    .filter((blocker) => overlaps(base, blocker))
    .map((blocker) => ({ start: Math.max(blocker.start, base.start), end: Math.min(blocker.end, base.end) }))
    .sort((a, b) => a.start - b.start);

  if (relevant.length === 0) {
    return [{ ...base }];
  }

  // Merge overlapping/touching blockers so one pass is enough.
  const merged = [relevant[0]];

  for (let index = 1; index < relevant.length; index += 1) {
    const last = merged[merged.length - 1];
    const current = relevant[index];

    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  const remaining = [];
  let cursor = base.start;

  for (const blocker of merged) {
    if (blocker.start > cursor) {
      remaining.push({ start: cursor, end: blocker.start });
    }

    cursor = Math.max(cursor, blocker.end);
  }

  if (cursor < base.end) {
    remaining.push({ start: cursor, end: base.end });
  }

  return remaining;
}

/**
 * Expands a protected movement by the configured safety buffer on both sides.
 * The buffer represents the time needed to clear staff and plant from the track
 * before a train arrives and to re-occupy after it has passed.
 */
export function bufferMovement(movement, bufferMinutes) {
  const bufferMs = bufferMinutes * 60_000;

  return {
    start: movement.start - bufferMs,
    end: movement.end + bufferMs,
    trainNumber: movement.trainNumber,
  };
}

/**
 * Estimates the operational cost of taking a block over `segment`.
 *
 * Protected passenger paths are already excluded, so what remains is freight
 * pressure: the expected goods volume in the overlapping forecast buckets, plus
 * a penalty for forecast uncertainty, since an uncertain forecast means the
 * control office is less able to plan around the block.
 */
export function calculateImpactScore(segment, forecastBuckets, freightMovements = []) {
  const segmentMinutes = (segment.end - segment.start) / 60_000;

  if (segmentMinutes <= 0) {
    return 0;
  }

  let weightedExpected = 0;
  let weightedUncertainty = 0;

  for (const bucket of forecastBuckets) {
    const shared = intersect(segment, bucket);

    if (!shared) {
      continue;
    }

    const sharedMinutes = (shared.end - shared.start) / 60_000;
    const bucketMinutes = (bucket.end - bucket.start) / 60_000;
    const fraction = bucketMinutes > 0 ? sharedMinutes / bucketMinutes : 0;

    weightedExpected += bucket.expectedTrainCount * fraction;
    weightedUncertainty += (bucket.upperCount - bucket.lowerCount) * fraction;
  }

  const freightOverlaps = freightMovements.filter((movement) => overlaps(segment, movement)).length;

  // Longer blocks cost more than short ones at the same traffic level.
  const durationFactor = segmentMinutes / 60;

  return (
    Math.round(
      (weightedExpected * 1.0 + weightedUncertainty * 0.4 + freightOverlaps * 0.6) *
        durationFactor *
        1000,
    ) / 1000
  );
}

/**
 * Splits each COA window into the segments left after protected trains are
 * removed, and scores each segment's operational impact.
 *
 * @param {object} input
 * @param {Array} input.windows      block windows with ms timestamps
 * @param {Array} input.movements    train movements with ms timestamps
 * @param {Array} input.forecasts    goods forecast buckets with ms timestamps
 * @param {{start: number, end: number}} input.horizon
 * @param {number} input.trainBufferMinutes
 */
export function buildUsableSegments({
  windows,
  movements,
  forecasts,
  horizon,
  trainBufferMinutes,
}) {
  const movementsBySection = new Map();
  const forecastsByCorridor = new Map();

  for (const movement of movements) {
    if (!movementsBySection.has(movement.sectionId)) {
      movementsBySection.set(movement.sectionId, []);
    }

    movementsBySection.get(movement.sectionId).push(movement);
  }

  for (const bucket of forecasts) {
    if (!forecastsByCorridor.has(bucket.corridorId)) {
      forecastsByCorridor.set(bucket.corridorId, []);
    }

    forecastsByCorridor.get(bucket.corridorId).push(bucket);
  }

  const segments = [];

  for (const window of windows) {
    // A window is only usable inside the requested horizon.
    const clipped = intersect(window, horizon);

    if (!clipped) {
      continue;
    }

    const sectionMovements = movementsBySection.get(window.sectionId) ?? [];
    const protectedMovements = sectionMovements.filter((movement) => movement.protected);
    const freightMovements = sectionMovements.filter((movement) => !movement.protected);

    const blockers = protectedMovements.map((movement) => bufferMovement(movement, trainBufferMinutes));
    const remaining = subtractIntervals(clipped, blockers);

    const conflictingTrains = protectedMovements
      .filter((movement) => overlaps(clipped, bufferMovement(movement, trainBufferMinutes)))
      .map((movement) => movement.trainNumber);

    remaining.forEach((piece, index) => {
      segments.push({
        id: `${window.id}#${index}`,
        blockWindowId: window.id,
        corridorId: window.corridorId,
        sectionId: window.sectionId,
        start: piece.start,
        end: piece.end,
        durationMinutes: (piece.end - piece.start) / 60_000,
        powerIsolationAvailable: window.powerIsolationAvailable,
        signallingDisconnectionAvailable: window.signallingDisconnectionAvailable,
        availableLineCount: window.availableLineCount,
        confidence: window.confidence,
        windowStart: window.start,
        windowEnd: window.end,
        removedByTrains: conflictingTrains,
        impactScore: calculateImpactScore(
          piece,
          forecastsByCorridor.get(window.corridorId) ?? [],
          freightMovements,
        ),
      });
    });
  }

  return segments.sort((a, b) => a.start - b.start || a.sectionId.localeCompare(b.sectionId));
}

/**
 * Decides whether one task can use one segment.
 * @returns {{ feasible: true } | { feasible: false, reasonCode: string, explanation: string }}
 */
export function evaluateTaskAgainstSegment(task, segment) {
  if (task.sectionId !== segment.sectionId) {
    return {
      feasible: false,
      reasonCode: REASON_CODES.NO_BLOCK_WINDOW,
      explanation: 'The window belongs to a different section',
    };
  }

  if (task.requiresPowerBlock && !segment.powerIsolationAvailable) {
    return {
      feasible: false,
      reasonCode: REASON_CODES.POWER_ISOLATION_UNAVAILABLE,
      explanation:
        'This task needs traction power isolation, which this window does not offer',
    };
  }

  if (task.requiresDisconnection && !segment.signallingDisconnectionAvailable) {
    return {
      feasible: false,
      reasonCode: REASON_CODES.DISCONNECTION_UNAVAILABLE,
      explanation:
        'This task needs a signalling disconnection, which this window does not offer',
    };
  }

  if (segment.durationMinutes < task.predictedDurationMinutes) {
    return {
      feasible: false,
      reasonCode: REASON_CODES.INSUFFICIENT_DURATION,
      explanation:
        `Usable time is ${Math.round(segment.durationMinutes)} min after protected trains are ` +
        `removed, but the P90 predicted duration is ${task.predictedDurationMinutes} min`,
    };
  }

  return { feasible: true };
}

/**
 * Builds the full option set. Every task gets either a list of feasible
 * segments or the single best explanation for why it has none.
 */
export function buildCandidateOptions({ tasks, segments, horizon }) {
  const segmentsBySection = new Map();

  for (const segment of segments) {
    if (!segmentsBySection.has(segment.sectionId)) {
      segmentsBySection.set(segment.sectionId, []);
    }

    segmentsBySection.get(segment.sectionId).push(segment);
  }

  const options = [];
  const rejections = new Map();

  // A reason is more useful the more specific it is, so the most specific
  // surviving reason wins when a task fails every segment for different causes.
  const REASON_PRIORITY = [
    REASON_CODES.INSUFFICIENT_DURATION,
    REASON_CODES.POWER_ISOLATION_UNAVAILABLE,
    REASON_CODES.DISCONNECTION_UNAVAILABLE,
    REASON_CODES.TRAIN_CONFLICT,
    REASON_CODES.NO_BLOCK_WINDOW,
    REASON_CODES.OUTSIDE_HORIZON,
  ];

  for (const task of tasks) {
    if (task.earliestStartMs > horizon.end) {
      rejections.set(task.id, {
        reasonCode: REASON_CODES.OUTSIDE_HORIZON,
        explanation: 'The task cannot start before the end of the selected horizon',
      });
      continue;
    }

    const sectionSegments = segmentsBySection.get(task.sectionId) ?? [];

    if (sectionSegments.length === 0) {
      rejections.set(task.id, {
        reasonCode: REASON_CODES.NO_BLOCK_WINDOW,
        explanation:
          'No corridor availability was published for this section inside the selected horizon',
      });
      continue;
    }

    const taskOptions = [];
    const failures = [];

    for (const segment of sectionSegments) {
      const verdict = evaluateTaskAgainstSegment(task, segment);

      if (!verdict.feasible) {
        failures.push(verdict);
        continue;
      }

      taskOptions.push({
        taskId: task.id,
        segmentId: segment.id,
        segment,
        // Cost combines the operational impact with how much of the segment the
        // task consumes, so a short job in a quiet window is the cheapest option.
        impactScore: segment.impactScore,
        utilisation: task.predictedDurationMinutes / segment.durationMinutes,
      });
    }

    if (taskOptions.length === 0) {
      const best =
        REASON_PRIORITY.map((code) => failures.find((failure) => failure.reasonCode === code)).find(
          Boolean,
        ) ?? failures[0];

      // Every usable segment on this section was created by removing trains, so
      // a duration failure on a section that had trains removed is really a
      // train conflict as far as the planner is concerned.
      const trainsRemoved = sectionSegments.some((segment) => segment.removedByTrains.length > 0);

      if (best?.reasonCode === REASON_CODES.INSUFFICIENT_DURATION && trainsRemoved) {
        rejections.set(task.id, {
          reasonCode: REASON_CODES.TRAIN_CONFLICT,
          explanation: `${best.explanation}. Protected trains split every window on this section.`,
        });
      } else {
        rejections.set(task.id, {
          reasonCode: best?.reasonCode ?? REASON_CODES.NO_BLOCK_WINDOW,
          explanation: best?.explanation ?? 'No feasible window was found',
        });
      }

      continue;
    }

    options.push(...taskOptions);
  }

  return { options, rejections };
}
