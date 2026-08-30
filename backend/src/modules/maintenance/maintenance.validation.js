import { z } from 'zod';

const optionalBoolean = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

export const taskFilterSchema = z.object({
  department: z.enum(['ENG', 'TRD', 'SNT']).optional(),
  sectionId: z.string().uuid().optional(),
  corridorId: z.string().uuid().optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: z.enum(['READY', 'PLANNED', 'COMPLETED', 'DEFERRED']).optional(),
  overdue: optionalBoolean,
  minPriority: z.coerce.number().min(0).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
});

export const recalculateSchema = z.object({
  retrain: z.boolean().optional(),
});
