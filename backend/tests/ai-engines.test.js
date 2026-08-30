import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DURATION_CONFIG,
  buildDurationIndex,
  median,
  percentile,
  predictDuration,
} from '../src/modules/planning/duration-engine.js';
import {
  MAX_RAW_SCORE,
  PRIORITY_WEIGHTS,
  calculateRulePriority,
} from '../src/modules/planning/priority-engine.js';
import {
  MIN_HISTORY_ROWS,
  buildFeatureSpec,
  encodeRow,
  predictRisk,
  trainRiskModel,
} from '../src/modules/planning/risk-model.js';

describe('rule priority fallback', () => {
  const baseTask = {
    severity: 'LOW',
    criticality: 1,
    daysOverdue: 0,
    safetyCritical: false,
    speedRestrictionKmph: null,
    corridorImportance: 1,
    repeatCount: 0,
  };

  it('scores the least urgent possible task near zero', () => {
    const { score, source } = calculateRulePriority(baseTask);

    assert.equal(source, 'RULE_FALLBACK');
    assert.ok(score > 0 && score < 10, `expected a small score, got ${score}`);
  });

  it('scores the most urgent possible task at 100', () => {
    const { score } = calculateRulePriority({
      severity: 'CRITICAL',
      criticality: 5,
      daysOverdue: 60,
      safetyCritical: true,
      speedRestrictionKmph: 15,
      corridorImportance: 5,
      repeatCount: 10,
    });

    assert.equal(score, 100);
  });

  it('never exceeds 100 however extreme the inputs', () => {
    const { score } = calculateRulePriority({
      severity: 'CRITICAL',
      criticality: 99,
      daysOverdue: 9999,
      safetyCritical: true,
      speedRestrictionKmph: 1,
      corridorImportance: 99,
      repeatCount: 999,
    });

    assert.ok(score <= 100, `score must be capped, got ${score}`);
  });

  it('raises the score monotonically as severity rises', () => {
    const scores = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(
      (severity) => calculateRulePriority({ ...baseTask, severity }).score,
    );

    for (let index = 1; index < scores.length; index += 1) {
      assert.ok(scores[index] > scores[index - 1], `severity ${index} did not increase the score`);
    }
  });

  it('explains every contributing factor', () => {
    const { reasons } = calculateRulePriority({
      ...baseTask,
      severity: 'HIGH',
      safetyCritical: true,
      daysOverdue: 12,
      speedRestrictionKmph: 30,
      repeatCount: 2,
    });

    const factors = reasons.map((reason) => reason.factor);

    assert.ok(factors.includes('SEVERITY'));
    assert.ok(factors.includes('SAFETY_CRITICAL'));
    assert.ok(factors.includes('OVERDUE'));
    assert.ok(factors.includes('SPEED_RESTRICTION'));
    assert.ok(factors.includes('REPEAT_DEFECT'));

    // Every reason carries a number the reader can add up.
    for (const reason of reasons) {
      assert.equal(typeof reason.contribution, 'number');
      assert.ok(reason.detail.length > 0);
    }
  });

  it('saturates the overdue contribution rather than growing without bound', () => {
    const atSaturation = calculateRulePriority({
      ...baseTask,
      daysOverdue: PRIORITY_WEIGHTS.overdueSaturationDays,
    }).score;

    const farBeyond = calculateRulePriority({ ...baseTask, daysOverdue: 3650 }).score;

    assert.equal(atSaturation, farBeyond);
  });

  it('has a maximum raw score matching the documented weight table', () => {
    assert.equal(MAX_RAW_SCORE, 25 + 25 + 15 + 15 + 10 + 5 + 5);
  });
});

describe('duration engine', () => {
  it('computes nearest-rank percentiles and medians', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

    assert.equal(median(values), 55);
    assert.equal(percentile(values, 0.9), 90);
    assert.equal(percentile(values, 0.5), 50);
    assert.equal(percentile([], 0.9), null);
  });

  it('uses the task-type P90 when there is enough history', () => {
    const history = Array.from({ length: 20 }, (unused, index) => ({
      taskType: 'TAMPING',
      department: 'ENG',
      requestedDurationMinutes: 100,
      actualDurationMinutes: 100 + index * 5,
    }));

    const prediction = predictDuration(
      { taskType: 'TAMPING', department: 'ENG', requestedDurationMinutes: 100 },
      buildDurationIndex(history),
    );

    assert.equal(prediction.source, 'HISTORY_P90');
    assert.equal(prediction.sampleCount, 20);
    assert.ok(prediction.predictedMinutes >= prediction.p90Minutes);
  });

  it('scales the requested duration by the department overrun ratio for an unseen task type', () => {
    // Every ENG job overran by exactly 50%.
    const history = Array.from({ length: 20 }, () => ({
      taskType: 'TAMPING',
      department: 'ENG',
      requestedDurationMinutes: 100,
      actualDurationMinutes: 150,
    }));

    const prediction = predictDuration(
      { taskType: 'NEVER_SEEN_BEFORE', department: 'ENG', requestedDurationMinutes: 40 },
      buildDurationIndex(history),
    );

    assert.equal(prediction.source, 'DEPARTMENT_OVERRUN_P90');
    // 40 minutes scaled by 1.5 is 60, not the 150 of an unrelated task type.
    assert.equal(prediction.predictedMinutes, 60);
  });

  it('falls back to the requested duration plus a buffer with no history at all', () => {
    const prediction = predictDuration(
      { taskType: 'ANY', department: 'SNT', requestedDurationMinutes: 60 },
      buildDurationIndex([]),
    );

    assert.equal(prediction.source, 'REQUESTED_PLUS_BUFFER');
    assert.equal(prediction.sampleCount, 0);
    assert.ok(prediction.predictedMinutes > 60);
    assert.ok(
      prediction.predictedMinutes >= 60 + DURATION_CONFIG.fallbackBufferMinimumMinutes,
      'the buffer floor must be respected',
    );
  });

  it('never predicts less than the requested duration', () => {
    // History says the job is usually much quicker than requested.
    const history = Array.from({ length: 20 }, () => ({
      taskType: 'QUICK',
      department: 'SNT',
      requestedDurationMinutes: 90,
      actualDurationMinutes: 10,
    }));

    const prediction = predictDuration(
      { taskType: 'QUICK', department: 'SNT', requestedDurationMinutes: 90 },
      buildDurationIndex(history),
    );

    assert.ok(prediction.predictedMinutes >= 90);
  });
});

describe('logistic regression risk model', () => {
  /** Builds a dataset where the label is a clean function of daysOverdue. */
  function buildSeparableHistory(rows) {
    return Array.from({ length: rows }, (unused, index) => {
      const daysOverdue = index % 60;

      return {
        taskType: index % 2 === 0 ? 'TAMPING' : 'RAIL_GRINDING',
        department: index % 3 === 0 ? 'ENG' : index % 3 === 1 ? 'TRD' : 'SNT',
        assetCriticality: 3,
        severity: daysOverdue > 30 ? 'CRITICAL' : 'LOW',
        daysOverdue,
        safetyCritical: daysOverdue > 30,
        speedRestrictionKmph: null,
        corridorImportance: 3,
        repeatCount: 0,
        requestedDurationMinutes: 60,
        actualDurationMinutes: 70,
        failureOrEscalation: daysOverdue > 30,
        completedAt: new Date(Date.UTC(2026, 0, 1) + index * 86_400_000).toISOString(),
      };
    });
  }

  it('refuses to train on too little history', () => {
    const result = trainRiskModel(buildSeparableHistory(MIN_HISTORY_ROWS - 1));

    assert.equal(result.trained, false);
    assert.match(result.reason, /history rows/);
  });

  it('learns a clearly separable signal', () => {
    const model = trainRiskModel(buildSeparableHistory(600));

    assert.equal(model.trained, true);
    assert.ok(
      model.metrics.validationAccuracy > 0.9,
      `expected high accuracy on separable data, got ${model.metrics.validationAccuracy}`,
    );

    const risky = predictRisk(model, {
      taskType: 'TAMPING',
      department: 'ENG',
      assetCriticality: 3,
      severity: 'CRITICAL',
      daysOverdue: 55,
      safetyCritical: true,
      speedRestrictionKmph: null,
      corridorImportance: 3,
      repeatCount: 0,
      requestedDurationMinutes: 60,
    });

    const safe = predictRisk(model, {
      taskType: 'TAMPING',
      department: 'ENG',
      assetCriticality: 3,
      severity: 'LOW',
      daysOverdue: 1,
      safetyCritical: false,
      speedRestrictionKmph: null,
      corridorImportance: 3,
      repeatCount: 0,
      requestedDurationMinutes: 60,
    });

    assert.ok(
      risky.probability > safe.probability,
      'an overdue critical task must score above a fresh low-severity one',
    );

    assert.ok(risky.probability >= 0 && risky.probability <= 1, 'probability must be in [0, 1]');
    assert.ok(safe.probability >= 0 && safe.probability <= 1, 'probability must be in [0, 1]');
  });

  it('is deterministic: the same history trains the same coefficients', () => {
    const history = buildSeparableHistory(400);

    const first = trainRiskModel(history);
    const second = trainRiskModel(history);

    assert.deepEqual(first.weights, second.weights);
    assert.equal(first.bias, second.bias);
  });

  it('orders features deterministically regardless of row order', () => {
    const history = buildSeparableHistory(300);
    const shuffled = [...history].reverse();

    assert.deepEqual(buildFeatureSpec(history).names, buildFeatureSpec(shuffled).names);
  });

  it('encodes an absent speed restriction as zero rather than a large number', () => {
    const spec = buildFeatureSpec([{ taskType: 'TAMPING' }]);
    const index = spec.names.indexOf('speedRestrictionSeverity');

    const withoutRestriction = encodeRow(
      { severity: 'LOW', department: 'ENG', taskType: 'TAMPING', speedRestrictionKmph: null },
      spec,
    );

    const withRestriction = encodeRow(
      { severity: 'LOW', department: 'ENG', taskType: 'TAMPING', speedRestrictionKmph: 15 },
      spec,
    );

    assert.equal(withoutRestriction[index], 0);
    assert.ok(withRestriction[index] > 0.9, 'a 15 km/h restriction should encode near 1');
  });

  it('splits training and validation by time, not at random', () => {
    const model = trainRiskModel(buildSeparableHistory(400));

    assert.equal(model.metrics.trainRows + model.metrics.validationRows, 400);
    assert.equal(model.metrics.validationRows, 100);
  });
});
