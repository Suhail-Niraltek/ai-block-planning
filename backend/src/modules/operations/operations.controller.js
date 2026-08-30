import { z } from 'zod';
import { ok } from '../../middleware/api-response.js';
import * as service from './operations.service.js';

const isoInstant = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'must be an ISO-8601 instant' });

const filterSchema = z.object({
  corridorId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  start: isoInstant.optional(),
  end: isoInstant.optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional(),
});

export async function listTrainMovements(req, res) {
  return ok(res, await service.listTrainMovements(filterSchema.parse(req.query)));
}

export async function listGoodsForecasts(req, res) {
  return ok(res, await service.listGoodsForecasts(filterSchema.parse(req.query)));
}

export async function listBlockWindows(req, res) {
  return ok(res, await service.listBlockWindows(filterSchema.parse(req.query)));
}
