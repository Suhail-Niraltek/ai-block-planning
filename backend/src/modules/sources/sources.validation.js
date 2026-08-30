import { z } from 'zod';

const isoInstant = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'must be an ISO-8601 instant' });

const severity = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

/**
 * TMS / SMMS / TDMS all deliver the same unified maintenance shape. The
 * department is supplied by the adapter, not the record, because it is a
 * property of the source system.
 */
export const maintenanceRecordSchema = z
  .object({
    externalId: z.string().min(1).max(96),
    sectionCode: z.string().min(1).max(32),
    assetCode: z.string().min(1).max(96),
    assetType: z.string().min(1).max(64),
    assetName: z.string().min(1).max(160),
    kmFrom: z.number().nullable().optional(),
    kmTo: z.number().nullable().optional(),
    criticality: z.number().int().min(1).max(5),
    defectType: z.string().min(1).max(64).nullable().optional(),
    taskType: z.string().min(1).max(64),
    title: z.string().min(1).max(200),
    severity,
    safetyCritical: z.boolean(),
    speedRestrictionKmph: z.number().int().min(1).max(160).nullable().optional(),
    detectedAt: isoInstant,
    dueAt: isoInstant,
    requestedDurationMinutes: z.number().int().min(5).max(1440),
    requiresLineBlock: z.boolean(),
    requiresPowerBlock: z.boolean(),
    requiresDisconnection: z.boolean(),
  })
  .refine((record) => Date.parse(record.detectedAt) <= Date.parse(record.dueAt) + 365 * 86_400_000, {
    message: 'detectedAt is implausibly far after dueAt',
  })
  .refine(
    (record) =>
      record.requiresLineBlock || record.requiresPowerBlock || record.requiresDisconnection,
    { message: 'a maintenance task must require at least one kind of block' },
  );

export const blockWindowRecordSchema = z
  .object({
    externalId: z.string().min(1).max(96),
    corridorCode: z.string().min(1).max(32),
    sectionCode: z.string().min(1).max(32),
    startsAt: isoInstant,
    endsAt: isoInstant,
    availableLineCount: z.number().int().min(0).max(8),
    powerIsolationAvailable: z.boolean(),
    signallingDisconnectionAvailable: z.boolean(),
    confidence: z.number().min(0).max(1),
    status: z.enum(['AVAILABLE', 'UNAVAILABLE']),
  })
  .refine((record) => Date.parse(record.endsAt) > Date.parse(record.startsAt), {
    message: 'endsAt must be after startsAt',
  });

export const trainMovementRecordSchema = z
  .object({
    externalId: z.string().min(1).max(96),
    trainNumber: z.string().min(1).max(16),
    trainType: z.enum(['PASSENGER', 'FREIGHT']),
    priorityClass: z.number().int().min(1).max(9),
    sectionCode: z.string().min(1).max(32),
    entryAt: isoInstant,
    exitAt: isoInstant,
    protected: z.boolean(),
    sourceType: z.enum(['TIMETABLE', 'COA', 'FORECAST']),
  })
  .refine((record) => Date.parse(record.exitAt) > Date.parse(record.entryAt), {
    message: 'exitAt must be after entryAt',
  });

export const goodsForecastRecordSchema = z
  .object({
    externalId: z.string().min(1).max(96),
    corridorCode: z.string().min(1).max(32),
    bucketStart: isoInstant,
    bucketEnd: isoInstant,
    expectedTrainCount: z.number().min(0),
    lowerCount: z.number().min(0),
    upperCount: z.number().min(0),
    sourceType: z.enum(['COA', 'DEMO_MODEL']),
  })
  .refine((record) => Date.parse(record.bucketEnd) > Date.parse(record.bucketStart), {
    message: 'bucketEnd must be after bucketStart',
  })
  .refine((record) => record.lowerCount <= record.upperCount, {
    message: 'lowerCount must not exceed upperCount',
  });

/** Maps an adapter kind onto the schema its records must satisfy. */
export const SCHEMA_BY_KIND = {
  MAINTENANCE: maintenanceRecordSchema,
  BLOCK_WINDOWS: blockWindowRecordSchema,
  TRAIN_MOVEMENTS: trainMovementRecordSchema,
  GOODS_FORECASTS: goodsForecastRecordSchema,
};

export const sourceCodeSchema = z.enum([
  'TMS',
  'SMMS',
  'TDMS',
  'COA',
  'TIMETABLE',
  'GOODS_FORECAST',
]);
