import { createRandom, deriveSeed, floatBetween, intBetween, isoAt } from './deterministic.js';

/** How many days of corridor availability the Control Office publishes ahead. */
const HORIZON_DAYS = 35;

/**
 * COA - Control Office Application.
 * Supplies corridor/section block availability windows.
 *
 * Windows are night blocks: 19:00-22:00 UTC is 00:30-03:30 IST, the usual
 * low-traffic maintenance period on an electrified double-line section.
 */
export const coaAdapter = {
  code: 'COA',
  name: 'Control Office Application',
  kind: 'BLOCK_WINDOWS',
  adapterType: 'MOCK',

  generate(context) {
    const { sections, epochMs, seed } = context;
    const random = createRandom(deriveSeed(seed, 'COA'));
    const records = [];

    let counter = 1;

    for (let dayOffset = 0; dayOffset < HORIZON_DAYS; dayOffset += 1) {
      sections.forEach((section, sectionIndex) => {
        // Each section gets a block every other night, staggered so the whole
        // network is never blocked on the same night.
        if ((dayOffset + sectionIndex) % 2 !== 0) {
          return;
        }

        const startMinutes = dayOffset * 24 * 60 + 19 * 60;
        // 3 to 4.5 hours, in half-hour steps.
        const durationMinutes = intBetween(random, 6, 9) * 30;

        // Section 0 is the integrated-block scenario: it always offers both
        // traction power isolation and signalling disconnection.
        const isIntegrationSection = sectionIndex === 0;

        // Section 1 never offers power isolation, so TRD work there is rejected.
        const isNoPowerSection = sectionIndex === 1;

        // The last section never offers signalling disconnection.
        const isNoDisconnectionSection = sectionIndex === sections.length - 1;

        let powerIsolation;
        let disconnection;

        if (isIntegrationSection) {
          powerIsolation = true;
          disconnection = true;
        } else if (isNoPowerSection) {
          powerIsolation = false;
          disconnection = random() < 0.6;
        } else if (isNoDisconnectionSection) {
          powerIsolation = random() < 0.6;
          disconnection = false;
        } else {
          powerIsolation = random() < 0.55;
          disconnection = random() < 0.55;
        }

        records.push({
          externalId: `COA-WINDOW-${String(counter).padStart(3, '0')}`,
          corridorCode: section.corridorCode,
          sectionCode: section.code,
          startsAt: isoAt(epochMs, startMinutes),
          endsAt: isoAt(epochMs, startMinutes + durationMinutes),
          availableLineCount: section.lineType === 'SINGLE' ? 1 : intBetween(random, 1, 2),
          powerIsolationAvailable: powerIsolation,
          signallingDisconnectionAvailable: disconnection,
          confidence: floatBetween(random, 0.7, 0.98, 2),
          status: 'AVAILABLE',
        });

        counter += 1;
      });
    }

    return records;
  },
};
