import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  REASON_CODES,
  buildCandidateOptions,
  buildUsableSegments,
  calculateImpactScore,
  evaluateTaskAgainstSegment,
  overlaps,
  subtractIntervals,
} from '../src/modules/planning/candidate-window-engine.js';

const MINUTE = 60_000;
const at = (minutes) => minutes * MINUTE;

describe('interval subtraction', () => {
  const base = { start: at(0), end: at(180) };

  it('returns the whole interval when nothing overlaps', () => {
    const result = subtractIntervals(base, [{ start: at(200), end: at(260) }]);
    assert.deepEqual(result, [{ start: at(0), end: at(180) }]);
  });

  it('returns nothing when a blocker fully covers the interval', () => {
    const result = subtractIntervals(base, [{ start: at(-10), end: at(200) }]);
    assert.deepEqual(result, []);
  });

  it('trims a partial overlap at the start', () => {
    const result = subtractIntervals(base, [{ start: at(-30), end: at(45) }]);
    assert.deepEqual(result, [{ start: at(45), end: at(180) }]);
  });

  it('trims a partial overlap at the end', () => {
    const result = subtractIntervals(base, [{ start: at(150), end: at(240) }]);
    assert.deepEqual(result, [{ start: at(0), end: at(150) }]);
  });

  it('splits the interval when one blocker sits in the middle', () => {
    const result = subtractIntervals(base, [{ start: at(60), end: at(90) }]);

    assert.deepEqual(result, [
      { start: at(0), end: at(60) },
      { start: at(90), end: at(180) },
    ]);
  });

  it('splits the interval around several blockers, merging overlaps', () => {
    const result = subtractIntervals(base, [
      { start: at(100), end: at(130) },
      { start: at(30), end: at(50) },
      // Overlaps the previous blocker and must merge rather than double-cut.
      { start: at(120), end: at(140) },
    ]);

    assert.deepEqual(result, [
      { start: at(0), end: at(30) },
      { start: at(50), end: at(100) },
      { start: at(140), end: at(180) },
    ]);
  });

  it('treats touching intervals as non-overlapping, since ranges are half-open', () => {
    assert.equal(overlaps({ start: at(0), end: at(60) }, { start: at(60), end: at(120) }), false);

    const result = subtractIntervals(base, [{ start: at(180), end: at(240) }]);
    assert.deepEqual(result, [{ start: at(0), end: at(180) }]);
  });
});

describe('usable segments', () => {
  const horizon = { start: at(0), end: at(24 * 60) };

  const window = {
    id: 'W1',
    corridorId: 'C1',
    sectionId: 'S1',
    start: at(19 * 60),
    end: at(22 * 60),
    powerIsolationAvailable: true,
    signallingDisconnectionAvailable: true,
    availableLineCount: 1,
    confidence: 0.9,
  };

  it('splits a window around one protected train, including the safety buffer', () => {
    const segments = buildUsableSegments({
      windows: [window],
      movements: [
        {
          sectionId: 'S1',
          trainNumber: '12002',
          protected: true,
          start: at(20 * 60),
          end: at(20 * 60 + 30),
        },
      ],
      forecasts: [],
      horizon,
      trainBufferMinutes: 10,
    });

    assert.equal(segments.length, 2);
    // 19:00 to 19:50 (train at 20:00 minus a 10 minute buffer)
    assert.equal(segments[0].durationMinutes, 50);
    // 20:40 (train ends 20:30 plus buffer) to 22:00
    assert.equal(segments[1].durationMinutes, 80);
    assert.deepEqual(segments[0].removedByTrains, ['12002']);
  });

  it('leaves a window whole when the only train is not protected', () => {
    const segments = buildUsableSegments({
      windows: [window],
      movements: [
        {
          sectionId: 'S1',
          trainNumber: '58421',
          protected: false,
          start: at(20 * 60),
          end: at(20 * 60 + 30),
        },
      ],
      forecasts: [],
      horizon,
      trainBufferMinutes: 10,
    });

    assert.equal(segments.length, 1);
    assert.equal(segments[0].durationMinutes, 180);
  });

  it('clips a window to the horizon', () => {
    const segments = buildUsableSegments({
      windows: [window],
      movements: [],
      forecasts: [],
      horizon: { start: at(20 * 60), end: at(21 * 60) },
      trainBufferMinutes: 10,
    });

    assert.equal(segments.length, 1);
    assert.equal(segments[0].durationMinutes, 60);
  });
});

describe('impact score', () => {
  it('rises with expected volume and with forecast uncertainty', () => {
    const segment = { start: at(0), end: at(60) };

    const quiet = calculateImpactScore(segment, [
      { start: at(0), end: at(60), expectedTrainCount: 1, lowerCount: 1, upperCount: 1 },
    ]);

    const busy = calculateImpactScore(segment, [
      { start: at(0), end: at(60), expectedTrainCount: 5, lowerCount: 5, upperCount: 5 },
    ]);

    const uncertain = calculateImpactScore(segment, [
      { start: at(0), end: at(60), expectedTrainCount: 5, lowerCount: 2, upperCount: 9 },
    ]);

    assert.ok(busy > quiet, 'a busier forecast must cost more');
    assert.ok(uncertain > busy, 'an uncertain forecast must cost more than a certain one');
  });
});

describe('task/segment feasibility', () => {
  const segment = {
    id: 'SEG1',
    sectionId: 'S1',
    durationMinutes: 120,
    powerIsolationAvailable: false,
    signallingDisconnectionAvailable: false,
    removedByTrains: [],
  };

  const baseTask = {
    id: 'T1',
    sectionId: 'S1',
    predictedDurationMinutes: 60,
    requiresPowerBlock: false,
    requiresDisconnection: false,
  };

  it('accepts a task that fits and needs nothing special', () => {
    assert.deepEqual(evaluateTaskAgainstSegment(baseTask, segment), { feasible: true });
  });

  it('rejects a task on a different section', () => {
    const verdict = evaluateTaskAgainstSegment({ ...baseTask, sectionId: 'S2' }, segment);
    assert.equal(verdict.reasonCode, REASON_CODES.NO_BLOCK_WINDOW);
  });

  it('rejects power-block work when isolation is unavailable', () => {
    const verdict = evaluateTaskAgainstSegment({ ...baseTask, requiresPowerBlock: true }, segment);
    assert.equal(verdict.reasonCode, REASON_CODES.POWER_ISOLATION_UNAVAILABLE);
  });

  it('rejects disconnection work when disconnection is unavailable', () => {
    const verdict = evaluateTaskAgainstSegment(
      { ...baseTask, requiresDisconnection: true },
      segment,
    );
    assert.equal(verdict.reasonCode, REASON_CODES.DISCONNECTION_UNAVAILABLE);
  });

  it('rejects a task whose predicted duration does not fit', () => {
    const verdict = evaluateTaskAgainstSegment(
      { ...baseTask, predictedDurationMinutes: 121 },
      segment,
    );

    assert.equal(verdict.reasonCode, REASON_CODES.INSUFFICIENT_DURATION);
  });

  it('accepts a task that exactly fills the segment', () => {
    const verdict = evaluateTaskAgainstSegment(
      { ...baseTask, predictedDurationMinutes: 120 },
      segment,
    );

    assert.deepEqual(verdict, { feasible: true });
  });
});

describe('candidate options', () => {
  const horizon = { start: at(0), end: at(24 * 60) };

  it('reports NO_BLOCK_WINDOW when a section has no published availability', () => {
    const { options, rejections } = buildCandidateOptions({
      tasks: [
        {
          id: 'T1',
          sectionId: 'S9',
          predictedDurationMinutes: 30,
          earliestStartMs: at(0),
          requiresPowerBlock: false,
          requiresDisconnection: false,
        },
      ],
      segments: [],
      horizon,
    });

    assert.equal(options.length, 0);
    assert.equal(rejections.get('T1').reasonCode, REASON_CODES.NO_BLOCK_WINDOW);
  });

  it('reports OUTSIDE_HORIZON when a task cannot start before the horizon ends', () => {
    const { rejections } = buildCandidateOptions({
      tasks: [
        {
          id: 'T1',
          sectionId: 'S1',
          predictedDurationMinutes: 30,
          earliestStartMs: at(48 * 60),
          requiresPowerBlock: false,
          requiresDisconnection: false,
        },
      ],
      segments: [],
      horizon,
    });

    assert.equal(rejections.get('T1').reasonCode, REASON_CODES.OUTSIDE_HORIZON);
  });

  it('reports TRAIN_CONFLICT when trains shrank every window below the needed duration', () => {
    const { rejections } = buildCandidateOptions({
      tasks: [
        {
          id: 'T1',
          sectionId: 'S1',
          predictedDurationMinutes: 90,
          earliestStartMs: at(0),
          requiresPowerBlock: false,
          requiresDisconnection: false,
        },
      ],
      segments: [
        {
          id: 'SEG1',
          sectionId: 'S1',
          durationMinutes: 40,
          powerIsolationAvailable: true,
          signallingDisconnectionAvailable: true,
          removedByTrains: ['12002'],
          impactScore: 1,
          start: at(19 * 60),
        },
      ],
      horizon,
    });

    assert.equal(rejections.get('T1').reasonCode, REASON_CODES.TRAIN_CONFLICT);
  });
});
