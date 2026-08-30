import { createRandom, deriveSeed, intBetween, isoAt } from './deterministic.js';

const HORIZON_DAYS = 35;

/**
 * Nightly protected passenger paths, expressed as minutes past midnight UTC.
 * These are the movements the candidate-window engine must subtract from any
 * COA window before the remaining time can be offered to maintenance.
 */
const NIGHT_PATHS = [
  // Crosses the middle of a typical 19:00 window, so it genuinely splits it.
  { trainNumber: '12002', priorityClass: 1, startMinute: 19 * 60 + 35, runMinutes: 30, frequency: 0.35 },
  // Clips the tail of the longer windows only.
  { trainNumber: '12626', priorityClass: 1, startMinute: 22 * 60 + 40, runMinutes: 25, frequency: 0.4 },
  // Runs before the maintenance period; present so the data is realistic, but
  // it should not consume usable block time.
  { trainNumber: '16318', priorityClass: 2, startMinute: 17 * 60 + 50, runMinutes: 35, frequency: 0.5 },
];

/**
 * Train Time Table.
 * Supplies protected passenger movements per section. `protected` means the
 * path may never be cancelled to create maintenance time.
 */
export const timetableAdapter = {
  code: 'TIMETABLE',
  name: 'Train Time Table',
  kind: 'TRAIN_MOVEMENTS',
  adapterType: 'MOCK',

  generate(context) {
    const { sections, epochMs, seed } = context;
    const random = createRandom(deriveSeed(seed, 'TIMETABLE'));
    const records = [];

    let counter = 1;

    for (let dayOffset = 0; dayOffset < HORIZON_DAYS; dayOffset += 1) {
      sections.forEach((section, sectionIndex) => {
        NIGHT_PATHS.forEach((path, pathIndex) => {
          // Demo situation 4: on the integration section the first path always
          // runs, so it visibly splits that night's three-hour COA window.
          const alwaysRuns = sectionIndex === 0 && pathIndex === 0;

          if (!alwaysRuns && random() > path.frequency) {
            return;
          }

          // Trains reach later sections progressively later in the night.
          const sectionDelay = sectionIndex * 12;
          const entryMinute = dayOffset * 24 * 60 + path.startMinute + sectionDelay;

          records.push({
            externalId: `TT-${path.trainNumber}-${section.code}-D${dayOffset}`,
            trainNumber: path.trainNumber,
            trainType: 'PASSENGER',
            priorityClass: path.priorityClass,
            sectionCode: section.code,
            entryAt: isoAt(epochMs, entryMinute),
            exitAt: isoAt(epochMs, entryMinute + path.runMinutes),
            protected: true,
            sourceType: 'TIMETABLE',
          });

          counter += 1;
        });

        // A small number of scheduled freight paths, which are not protected and
        // therefore only raise the impact cost of a window rather than blocking it.
        if (random() < 0.25) {
          const entryMinute = dayOffset * 24 * 60 + 21 * 60 + intBetween(random, 0, 90);

          records.push({
            externalId: `TT-FRT-${section.code}-D${dayOffset}`,
            trainNumber: `5${String(intBetween(random, 100, 999))}`,
            trainType: 'FREIGHT',
            priorityClass: 4,
            sectionCode: section.code,
            entryAt: isoAt(epochMs, entryMinute),
            exitAt: isoAt(epochMs, entryMinute + intBetween(random, 30, 55)),
            protected: false,
            sourceType: 'TIMETABLE',
          });

          counter += 1;
        }
      });
    }

    return records;
  },
};
