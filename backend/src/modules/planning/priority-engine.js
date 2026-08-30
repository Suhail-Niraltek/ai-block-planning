/**
 * Level 1 priority: a transparent, fully explainable weighted score.
 *
 * This is always available and is the fallback whenever the learned model is
 * missing, stale, or trained on too little history. Every weight lives in the
 * single configuration object below so a judge can ask for one to be changed
 * and see the effect immediately.
 */

export const PRIORITY_WEIGHTS = {
  severity: { LOW: 4, MEDIUM: 10, HIGH: 18, CRITICAL: 25 },
  safetyCritical: 25,
  // Asset criticality 1-5 scales linearly up to this maximum.
  criticalityMax: 15,
  // Overdue contribution saturates at `overdueSaturationDays`.
  overdueMax: 15,
  overdueSaturationDays: 30,
  // A speed restriction is worse the slower it is; 15 km/h scores the maximum.
  speedRestrictionMax: 10,
  speedRestrictionFloorKmph: 15,
  speedRestrictionCeilingKmph: 90,
  // Corridor importance 1-5 scales linearly up to this maximum.
  corridorImportanceMax: 5,
  // Each prior defect on the same asset adds this much, capped at the maximum.
  repeatPerDefect: 1.5,
  repeatMax: 5,
};

/** Theoretical maximum, used to normalise the raw sum onto 0-100. */
export const MAX_RAW_SCORE =
  PRIORITY_WEIGHTS.severity.CRITICAL +
  PRIORITY_WEIGHTS.safetyCritical +
  PRIORITY_WEIGHTS.criticalityMax +
  PRIORITY_WEIGHTS.overdueMax +
  PRIORITY_WEIGHTS.speedRestrictionMax +
  PRIORITY_WEIGHTS.corridorImportanceMax +
  PRIORITY_WEIGHTS.repeatMax;

function round2(value) {
  return Math.round(value * 100) / 100;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * @param {object} task normalised task fields
 * @returns {{ score: number, source: 'RULE_FALLBACK', reasons: Array }}
 */
export function calculateRulePriority(task) {
  const reasons = [];
  let raw = 0;

  const severityPoints = PRIORITY_WEIGHTS.severity[task.severity] ?? PRIORITY_WEIGHTS.severity.MEDIUM;
  raw += severityPoints;
  reasons.push({
    factor: 'SEVERITY',
    contribution: round2(severityPoints),
    detail: `Severity ${task.severity}`,
  });

  if (task.safetyCritical) {
    raw += PRIORITY_WEIGHTS.safetyCritical;
    reasons.push({
      factor: 'SAFETY_CRITICAL',
      contribution: PRIORITY_WEIGHTS.safetyCritical,
      detail: 'Flagged safety critical by the source system',
    });
  }

  const criticality = clamp(Number(task.criticality) || 1, 1, 5);
  const criticalityPoints = ((criticality - 1) / 4) * PRIORITY_WEIGHTS.criticalityMax;
  raw += criticalityPoints;
  reasons.push({
    factor: 'ASSET_CRITICALITY',
    contribution: round2(criticalityPoints),
    detail: `Asset criticality ${criticality} of 5`,
  });

  const daysOverdue = Math.max(0, Number(task.daysOverdue) || 0);

  if (daysOverdue > 0) {
    const overduePoints =
      Math.min(daysOverdue, PRIORITY_WEIGHTS.overdueSaturationDays) /
      PRIORITY_WEIGHTS.overdueSaturationDays *
      PRIORITY_WEIGHTS.overdueMax;

    raw += overduePoints;
    reasons.push({
      factor: 'OVERDUE',
      contribution: round2(overduePoints),
      detail: `${daysOverdue} day(s) past due`,
    });
  }

  if (task.speedRestrictionKmph) {
    const { speedRestrictionFloorKmph: floor, speedRestrictionCeilingKmph: ceiling } =
      PRIORITY_WEIGHTS;
    const restricted = clamp(Number(task.speedRestrictionKmph), floor, ceiling);
    const severityOfRestriction = (ceiling - restricted) / (ceiling - floor);
    const restrictionPoints = severityOfRestriction * PRIORITY_WEIGHTS.speedRestrictionMax;

    raw += restrictionPoints;
    reasons.push({
      factor: 'SPEED_RESTRICTION',
      contribution: round2(restrictionPoints),
      detail: `${task.speedRestrictionKmph} km/h restriction in force`,
    });
  }

  const corridorImportance = clamp(Number(task.corridorImportance) || 1, 1, 5);
  const corridorPoints = ((corridorImportance - 1) / 4) * PRIORITY_WEIGHTS.corridorImportanceMax;
  raw += corridorPoints;
  reasons.push({
    factor: 'CORRIDOR_IMPORTANCE',
    contribution: round2(corridorPoints),
    detail: `Corridor importance ${corridorImportance} of 5`,
  });

  const repeatCount = Math.max(0, Number(task.repeatCount) || 0);

  if (repeatCount > 0) {
    const repeatPoints = Math.min(
      repeatCount * PRIORITY_WEIGHTS.repeatPerDefect,
      PRIORITY_WEIGHTS.repeatMax,
    );

    raw += repeatPoints;
    reasons.push({
      factor: 'REPEAT_DEFECT',
      contribution: round2(repeatPoints),
      detail: `${repeatCount} earlier defect(s) on this asset`,
    });
  }

  const score = round2(clamp((raw / MAX_RAW_SCORE) * 100, 0, 100));

  return { score, source: 'RULE_FALLBACK', reasons };
}
