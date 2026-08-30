import { z } from 'zod';

const isoInstant = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'must be an ISO-8601 instant' });

export const planningRequestSchema = z
  .object({
    horizonType: z.enum(['WEEKLY', 'MONTHLY']),
    horizonStart: isoInstant,
    horizonEnd: isoInstant.optional(),
    corridorIds: z.array(z.string().uuid()).optional(),
  })
  .refine(
    (request) => !request.horizonEnd || Date.parse(request.horizonEnd) > Date.parse(request.horizonStart),
    { message: 'horizonEnd must be after horizonStart', path: ['horizonEnd'] },
  );

export const compareQuerySchema = z.object({
  optimizedPlanId: z.string().uuid(),
  baselinePlanId: z.string().uuid(),
});

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
