import { ok } from '../../middleware/api-response.js';
import * as service from './sources.service.js';
import { sourceCodeSchema } from './sources.validation.js';

export async function listSources(req, res) {
  const sources = await service.listSources();
  return ok(res, sources);
}

export async function syncSource(req, res) {
  const code = sourceCodeSchema.parse(String(req.params.code).toUpperCase());
  const result = await service.syncSource(code);
  return ok(res, result, `Synced ${result.acceptedCount} record(s) from ${code}`);
}

export async function syncAllSources(req, res) {
  const results = await service.syncAllSources();
  const accepted = results.reduce((total, item) => total + item.acceptedCount, 0);
  return ok(res, results, `Synced ${accepted} record(s) from ${results.length} sources`);
}

export async function listSyncRuns(req, res) {
  const runs = await service.listSyncRuns(req.query.limit);
  return ok(res, runs);
}

export async function getSyncRun(req, res) {
  const run = await service.getSyncRun(req.params.id);
  return ok(res, run);
}
