import { chance, createRandom, deriveSeed, intBetween, isoAt, pick } from './deterministic.js';

const ASSET_TYPES = ['OHE', 'FEEDER', 'ISOLATOR', 'NEUTRAL_SECTION', 'TRACTION_SUBSTATION'];

const TASK_TYPES = [
  'CONTACT_WIRE_INSPECTION',
  'OHE_TENSIONING',
  'INSULATOR_REPLACEMENT',
  'ISOLATOR_SERVICING',
  'NEUTRAL_SECTION_REPAIR',
  'FEEDER_CABLE_TESTING',
];

const DEFECT_TYPES = [
  'CONTACT_WIRE_WEAR',
  'INSULATOR_FLASHOVER',
  'DROPPER_BREAKAGE',
  'TENSION_LOSS',
  'ISOLATOR_STIFF',
];

/**
 * TDMS - Traction Distribution Management System.
 * Supplies Traction Distribution (TRD) / OHE assets and tasks. Nearly all of
 * this work needs traction power isolation, which not every window offers.
 */
export const tdmsAdapter = {
  code: 'TDMS',
  name: 'Traction Distribution Management System',
  department: 'TRD',
  kind: 'MAINTENANCE',
  adapterType: 'MOCK',

  generate(context) {
    const { sections, epochMs, seed } = context;
    const random = createRandom(deriveSeed(seed, 'TDMS'));
    const records = [];

    let counter = 1;
    const anchor = sections[0];

    if (anchor) {
      // Demo situation 1 - the TRD half of the integrated block.
      records.push({
        externalId: 'TDMS-TASK-001',
        sectionCode: anchor.code,
        assetCode: `${anchor.code}-OHE-ES04`,
        assetType: 'OHE',
        assetName: 'OHE elementary section ES-04',
        criticality: 4,
        defectType: 'CONTACT_WIRE_WEAR',
        taskType: 'CONTACT_WIRE_INSPECTION',
        title: 'Contact wire inspection and dropper check ES-04',
        severity: 'MEDIUM',
        safetyCritical: false,
        speedRestrictionKmph: null,
        detectedAt: isoAt(epochMs, -6 * 24 * 60),
        dueAt: isoAt(epochMs, 7 * 24 * 60),
        requestedDurationMinutes: 90,
        requiresLineBlock: true,
        requiresPowerBlock: true,
        requiresDisconnection: false,
      });

      // Demo situation 3 - a TRD task on a section whose windows never carry
      // power isolation, so it is rejected with POWER_ISOLATION_UNAVAILABLE.
      const noPowerSection = sections[Math.min(1, sections.length - 1)];

      records.push({
        externalId: 'TDMS-TASK-002',
        sectionCode: noPowerSection.code,
        assetCode: `${noPowerSection.code}-ISOLATOR-11`,
        assetType: 'ISOLATOR',
        assetName: 'Section isolator SI-11',
        criticality: 5,
        defectType: 'ISOLATOR_STIFF',
        taskType: 'ISOLATOR_SERVICING',
        title: 'Section isolator SI-11 servicing (needs power block)',
        severity: 'HIGH',
        safetyCritical: false,
        speedRestrictionKmph: null,
        detectedAt: isoAt(epochMs, -11 * 24 * 60),
        dueAt: isoAt(epochMs, 3 * 24 * 60),
        requestedDurationMinutes: 120,
        requiresLineBlock: true,
        requiresPowerBlock: true,
        requiresDisconnection: false,
      });

      counter = 3;
    }

    for (const section of sections) {
      if (!section.electrified) {
        continue;
      }

      const perSection = intBetween(random, 2, 4);

      for (let index = 0; index < perSection; index += 1) {
        const assetType = pick(random, ASSET_TYPES);
        const taskType = pick(random, TASK_TYPES);
        const severity = pick(random, ['LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'HIGH']);

        records.push({
          externalId: `TDMS-TASK-${String(counter).padStart(3, '0')}`,
          sectionCode: section.code,
          assetCode: `${section.code}-TRD-${String(index + 1).padStart(2, '0')}`,
          assetType,
          assetName: `${assetType.replaceAll('_', ' ')} ${section.code} #${index + 1}`,
          criticality: intBetween(random, 2, 5),
          defectType: pick(random, DEFECT_TYPES),
          taskType,
          title: `${taskType.replaceAll('_', ' ').toLowerCase()} on ${section.code}`,
          severity,
          safetyCritical: chance(random, 0.15),
          speedRestrictionKmph: null,
          detectedAt: isoAt(epochMs, -intBetween(random, 3, 35) * 24 * 60),
          dueAt: isoAt(epochMs, intBetween(random, -4, 21) * 24 * 60),
          requestedDurationMinutes: pick(random, [60, 90, 120, 150]),
          requiresLineBlock: chance(random, 0.8),
          requiresPowerBlock: true,
          requiresDisconnection: false,
        });

        counter += 1;
      }
    }

    return records;
  },
};
