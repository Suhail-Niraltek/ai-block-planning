import * as repository from './operations.repository.js';

const toBoolean = (value) => value === 1 || value === true;

export async function listTrainMovements(filters) {
  const rows = await repository.findTrainMovements(filters);
  return rows.map((row) => ({ ...row, protected: toBoolean(row.protected) }));
}

export async function listGoodsForecasts(filters) {
  const rows = await repository.findGoodsForecasts(filters);

  return rows.map((row) => ({
    ...row,
    expectedTrainCount: Number(row.expectedTrainCount),
    lowerCount: Number(row.lowerCount),
    upperCount: Number(row.upperCount),
  }));
}

export async function listBlockWindows(filters) {
  const rows = await repository.findBlockWindows(filters);

  return rows.map((row) => ({
    ...row,
    powerIsolationAvailable: toBoolean(row.powerIsolationAvailable),
    signallingDisconnectionAvailable: toBoolean(row.signallingDisconnectionAvailable),
    confidence: Number(row.confidence),
  }));
}
