import { ok } from '../../middleware/api-response.js';
import * as service from './planning.service.js';
import { compareQuerySchema, listQuerySchema, planningRequestSchema } from './planning.validation.js';

export async function createRun(req, res) {
  const request = planningRequestSchema.parse(req.body ?? {});
  const result = await service.createPlanningRun(request);
  return ok(res, result, 'Planning run completed', 201);
}

export async function listRuns(req, res) {
  const { limit } = listQuerySchema.parse(req.query);
  return ok(res, await service.listRuns(limit));
}

export async function getRun(req, res) {
  return ok(res, await service.getRun(req.params.id));
}

export async function getPlansForRun(req, res) {
  return ok(res, await service.getPlansForRun(req.params.id));
}

export async function getPlan(req, res) {
  return ok(res, await service.getPlan(req.params.id));
}

export async function getPlanBlocks(req, res) {
  return ok(res, await service.getPlanBlocks(req.params.id));
}

export async function getUnscheduledTasks(req, res) {
  return ok(res, await service.getUnscheduledTasks(req.params.id));
}

export async function comparePlans(req, res) {
  const { optimizedPlanId, baselinePlanId } = compareQuerySchema.parse(req.query);
  return ok(res, await service.comparePlanIds(optimizedPlanId, baselinePlanId));
}
