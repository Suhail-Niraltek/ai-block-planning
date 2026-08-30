import { createRandom, deriveSeed, isoAt } from './deterministic.js';

const HORIZON_DAYS = 35;

/** One forecast bucket per hour across the night maintenance period. */
const BUCKET_START_HOUR = 17;
const BUCKET_END_HOUR = 24;

/**
 * Goods-train forecast from the Control Office.
 *
 * This does not block a window outright - freight can be regulated - but a high
 * or highly uncertain forecast raises the operational impact of taking a block,
 * which the optimizer minimises.
 */
export const goodsForecastAdapter = {
  code: 'GOODS_FORECAST',
  name: 'Control Office goods-train forecast',
  kind: 'GOODS_FORECASTS',
  adapterType: 'MOCK',

  generate(context) {
    const { corridors, epochMs, seed } = context;
    const random = createRandom(deriveSeed(seed, 'GOODS_FORECAST'));
    const records = [];

    let counter = 1;

    for (let dayOffset = 0; dayOffset < HORIZON_DAYS; dayOffset += 1) {
      // A weekly rhythm: mid-week carries the heaviest freight programme.
      const dayOfWeek = dayOffset % 7;
      const weeklyFactor = [0.6, 0.9, 1.2, 1.35, 1.25, 0.95, 0.55][dayOfWeek];

      for (const corridor of corridors) {
        const corridorFactor = 0.7 + corridor.importanceScore * 0.18;

        for (let hour = BUCKET_START_HOUR; hour < BUCKET_END_HOUR; hour += 1) {
          // Freight thins out after midnight-IST, so later buckets are quieter.
          const hourFactor = hour >= 21 ? 0.6 : 1.1;
          const noise = 0.85 + random() * 0.3;

          const expected = Number((2.4 * weeklyFactor * corridorFactor * hourFactor * noise).toFixed(2));
          const spread = Number((expected * (0.25 + random() * 0.2)).toFixed(2));

          const bucketStartMinutes = dayOffset * 24 * 60 + hour * 60;

          records.push({
            externalId: `GF-${corridor.code}-D${dayOffset}-H${hour}`,
            corridorCode: corridor.code,
            bucketStart: isoAt(epochMs, bucketStartMinutes),
            bucketEnd: isoAt(epochMs, bucketStartMinutes + 60),
            expectedTrainCount: expected,
            lowerCount: Number(Math.max(0, expected - spread).toFixed(2)),
            upperCount: Number((expected + spread).toFixed(2)),
            sourceType: 'COA',
          });

          counter += 1;
        }
      }
    }

    return records;
  },
};
