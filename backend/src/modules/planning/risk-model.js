import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Level 2 priority: logistic regression in plain JavaScript.
 *
 * Target: did this maintenance item fail, escalate, or force an operational
 * restriction BEFORE the work was carried out? A high predicted probability
 * means deferring the task is risky, which is exactly what the block plan
 * should be prioritising against.
 *
 * The model is small and fully deterministic: fixed feature ordering, fixed
 * initial weights, fixed learning rate and epoch count. Training the same
 * history twice produces identical coefficients.
 */

const MODEL_PATH = join(dirname(fileURLToPath(import.meta.url)), 'risk-model.json');

/** Below this many historical rows the learned model is not trusted. */
export const MIN_HISTORY_ROWS = 200;

const SEVERITY_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const DEPARTMENTS = ['ENG', 'TRD', 'SNT'];

const DEFAULT_OPTIONS = {
  learningRate: 0.08,
  epochs: 600,
  l2: 0.0015,
  validationFraction: 0.25,
};

/**
 * Builds the feature layout. Task types are discovered from the data but sorted
 * so the column order never depends on row order or map iteration.
 */
export function buildFeatureSpec(rows) {
  const taskTypes = [...new Set(rows.map((row) => row.taskType))].sort();

  const names = [
    ...SEVERITY_LEVELS.map((level) => `severity=${level}`),
    ...DEPARTMENTS.map((department) => `department=${department}`),
    ...taskTypes.map((taskType) => `taskType=${taskType}`),
    'assetCriticality',
    'daysOverdue',
    'safetyCritical',
    'speedRestrictionSeverity',
    'corridorImportance',
    'requestedDurationMinutes',
    'repeatCount',
  ];

  return { taskTypes, names };
}

/** Encodes one row into the raw (un-normalised) feature vector. */
export function encodeRow(row, spec) {
  const vector = [];

  for (const level of SEVERITY_LEVELS) {
    vector.push(row.severity === level ? 1 : 0);
  }

  for (const department of DEPARTMENTS) {
    vector.push(row.department === department ? 1 : 0);
  }

  for (const taskType of spec.taskTypes) {
    vector.push(row.taskType === taskType ? 1 : 0);
  }

  vector.push(Number(row.assetCriticality) || 0);
  vector.push(Number(row.daysOverdue) || 0);
  vector.push(row.safetyCritical ? 1 : 0);

  // A restriction is encoded by how severe it is, not its raw speed, so that
  // "no restriction" is 0 rather than an arbitrarily large number.
  const speed = Number(row.speedRestrictionKmph) || 0;
  vector.push(speed > 0 ? Math.max(0, Math.min(1, (90 - speed) / 75)) : 0);

  vector.push(Number(row.corridorImportance) || 0);
  vector.push(Number(row.requestedDurationMinutes) || 0);
  vector.push(Number(row.repeatCount) || 0);

  return vector;
}

function computeNormalisation(matrix) {
  const columns = matrix[0].length;
  const means = new Array(columns).fill(0);
  const deviations = new Array(columns).fill(1);

  for (let column = 0; column < columns; column += 1) {
    let sum = 0;
    for (const row of matrix) sum += row[column];
    means[column] = sum / matrix.length;

    let variance = 0;
    for (const row of matrix) variance += (row[column] - means[column]) ** 2;

    const standardDeviation = Math.sqrt(variance / matrix.length);
    // A constant column would divide by zero; leave it centred instead.
    deviations[column] = standardDeviation < 1e-9 ? 1 : standardDeviation;
  }

  return { means, deviations };
}

function normalise(vector, { means, deviations }) {
  return vector.map((value, index) => (value - means[index]) / deviations[index]);
}

function sigmoid(z) {
  if (z >= 0) {
    return 1 / (1 + Math.exp(-z));
  }

  const exp = Math.exp(z);
  return exp / (1 + exp);
}

function predictRaw(weights, bias, features) {
  let z = bias;

  for (let index = 0; index < features.length; index += 1) {
    z += weights[index] * features[index];
  }

  return sigmoid(z);
}

function logLoss(weights, bias, matrix, labels) {
  let total = 0;

  for (let index = 0; index < matrix.length; index += 1) {
    const probability = Math.min(Math.max(predictRaw(weights, bias, matrix[index]), 1e-9), 1 - 1e-9);
    total += labels[index] * Math.log(probability) + (1 - labels[index]) * Math.log(1 - probability);
  }

  return -total / matrix.length;
}

/** Area under the ROC curve, computed by rank so no threshold is assumed. */
function rocAuc(scores, labels) {
  const positives = labels.reduce((total, label) => total + label, 0);
  const negatives = labels.length - positives;

  if (positives === 0 || negatives === 0) {
    return null;
  }

  const indexed = scores
    .map((score, index) => ({ score, label: labels[index] }))
    .sort((a, b) => a.score - b.score);

  let rankSum = 0;
  let position = 0;

  while (position < indexed.length) {
    let end = position;
    while (end + 1 < indexed.length && indexed[end + 1].score === indexed[position].score) {
      end += 1;
    }

    // Average rank across ties, ranks being 1-based.
    const averageRank = (position + 1 + (end + 1)) / 2;

    for (let index = position; index <= end; index += 1) {
      if (indexed[index].label === 1) {
        rankSum += averageRank;
      }
    }

    position = end + 1;
  }

  return (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

/**
 * Trains the model with batch gradient descent.
 * The split is time based: the oldest rows train, the most recent validate, so
 * the reported metric is not inflated by leaking future outcomes into training.
 */
export function trainRiskModel(rows, options = {}) {
  const settings = { ...DEFAULT_OPTIONS, ...options };

  if (rows.length < MIN_HISTORY_ROWS) {
    return {
      trained: false,
      reason: `Only ${rows.length} history rows; ${MIN_HISTORY_ROWS} required`,
    };
  }

  const ordered = [...rows].sort(
    (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
  );

  const spec = buildFeatureSpec(ordered);
  const encoded = ordered.map((row) => encodeRow(row, spec));
  const labels = ordered.map((row) => (row.failureOrEscalation ? 1 : 0));

  const splitIndex = Math.floor(ordered.length * (1 - settings.validationFraction));
  const trainMatrixRaw = encoded.slice(0, splitIndex);
  const validationMatrixRaw = encoded.slice(splitIndex);
  const trainLabels = labels.slice(0, splitIndex);
  const validationLabels = labels.slice(splitIndex);

  // Normalisation statistics come from the training split only.
  const normalisation = computeNormalisation(trainMatrixRaw);
  const trainMatrix = trainMatrixRaw.map((row) => normalise(row, normalisation));
  const validationMatrix = validationMatrixRaw.map((row) => normalise(row, normalisation));

  const featureCount = spec.names.length;
  const weights = new Array(featureCount).fill(0);
  let bias = 0;

  for (let epoch = 0; epoch < settings.epochs; epoch += 1) {
    const gradients = new Array(featureCount).fill(0);
    let biasGradient = 0;

    for (let index = 0; index < trainMatrix.length; index += 1) {
      const error = predictRaw(weights, bias, trainMatrix[index]) - trainLabels[index];
      biasGradient += error;

      for (let feature = 0; feature < featureCount; feature += 1) {
        gradients[feature] += error * trainMatrix[index][feature];
      }
    }

    const scale = settings.learningRate / trainMatrix.length;

    for (let feature = 0; feature < featureCount; feature += 1) {
      // L2 keeps the one-hot columns from blowing up on rare task types.
      weights[feature] -=
        scale * gradients[feature] + settings.learningRate * settings.l2 * weights[feature];
    }

    bias -= scale * biasGradient;
  }

  const validationScores = validationMatrix.map((row) => predictRaw(weights, bias, row));
  const correct = validationScores.reduce(
    (total, score, index) => total + ((score >= 0.5 ? 1 : 0) === validationLabels[index] ? 1 : 0),
    0,
  );

  const positiveRate = validationLabels.reduce((a, b) => a + b, 0) / validationLabels.length;

  return {
    trained: true,
    version: 1,
    trainedAt: new Date().toISOString(),
    dataOrigin: 'SYNTHETIC',
    featureNames: spec.names,
    taskTypes: spec.taskTypes,
    weights,
    bias,
    normalisation,
    metrics: {
      trainRows: trainMatrix.length,
      validationRows: validationMatrix.length,
      validationAccuracy: Number((correct / validationMatrix.length).toFixed(4)),
      validationLogLoss: Number(logLoss(weights, bias, validationMatrix, validationLabels).toFixed(4)),
      validationRocAuc: (() => {
        const auc = rocAuc(validationScores, validationLabels);
        return auc === null ? null : Number(auc.toFixed(4));
      })(),
      validationPositiveRate: Number(positiveRate.toFixed(4)),
    },
  };
}

export async function saveRiskModel(model) {
  await writeFile(MODEL_PATH, `${JSON.stringify(model, null, 2)}\n`, 'utf8');
  return MODEL_PATH;
}

/** Returns the stored model, or null when it is absent or unreadable. */
export async function loadRiskModel() {
  try {
    const raw = await readFile(MODEL_PATH, 'utf8');
    const model = JSON.parse(raw);

    if (!model?.trained || !Array.isArray(model.weights)) {
      return null;
    }

    return model;
  } catch {
    return null;
  }
}

/**
 * Scores one task with the loaded model.
 * @returns {{ probability: number, contributions: Array }}
 */
export function predictRisk(model, task) {
  const spec = { taskTypes: model.taskTypes };
  const raw = encodeRow(task, spec);
  const features = normalise(raw, model.normalisation);

  let z = model.bias;
  const contributions = [];

  for (let index = 0; index < model.weights.length; index += 1) {
    const contribution = model.weights[index] * features[index];
    z += contribution;

    contributions.push({ feature: model.featureNames[index], contribution });
  }

  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return { probability: sigmoid(z), contributions };
}

export { MODEL_PATH };
