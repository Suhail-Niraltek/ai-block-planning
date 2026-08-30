import { ok } from '../../middleware/api-response.js';
import * as service from './maintenance.service.js';
import { recalculateSchema, taskFilterSchema } from './maintenance.validation.js';

export async function listTasks(req, res) {
  const { limit, ...filters } = taskFilterSchema.parse(req.query);
  const tasks = await service.listTasks(filters, limit);
  return ok(res, tasks);
}

export async function getTask(req, res) {
  const task = await service.getTask(req.params.id);
  return ok(res, task);
}

export async function getSummary(req, res) {
  const summary = await service.getSummary();
  return ok(res, summary);
}

export async function recalculatePriorities(req, res) {
  const options = recalculateSchema.parse(req.body ?? {});
  const result = await service.recalculatePriorities(options);
  return ok(res, result, `Scored ${result.tasksScored} task(s)`);
}
