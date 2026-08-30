import {
  chance,
  createRandom,
  deriveSeed,
  floatBetween,
  intBetween,
  isoAt,
  pick,
} from './deterministic.js';

const DEFECT_TYPES = [
  'RAIL_WEAR',
  'RAIL_FRACTURE_RISK',
  'BALLAST_DEFICIENCY',
  'GEOMETRY_DEVIATION',
  'WELD_DEFECT',
  'FISH_PLATE_CRACK',
];

const TASK_TYPES = [
  'RAIL_GRINDING',
  'TAMPING',
  'BALLAST_RENEWAL',
  'WELD_REPAIR',
  'TRACK_GEOMETRY_CORRECTION',
  'FISH_PLATE_REPLACEMENT',
];

const ASSET_TYPES = ['TRACK', 'TURNOUT', 'BRIDGE_APPROACH', 'LEVEL_CROSSING'];

/**
 * TMS - Track Management System.
 * Supplies Engineering (ENG) track assets, defects, and maintenance tasks.
 */
export const tmsAdapter = {
  code: 'TMS',
  name: 'Track Management System',
  department: 'ENG',
  kind: 'MAINTENANCE',
  adapterType: 'MOCK',

  /**
   * @param {{ sections: Array, epochMs: number, seed: number }} context
   * @returns {Array<object>} raw external records, still unvalidated
   */
  generate(context) {
    const { sections, epochMs, seed } = context;
    const random = createRandom(deriveSeed(seed, 'TMS'));
    const records = [];

    let counter = 1;

    // Scenario anchor: the first section carries the tasks the demo must show.
    const anchor = sections[0];

    if (anchor) {
      // Demo situation 1 - an ENG task that can share an integrated block.
      records.push({
        externalId: 'TMS-DEF-001',
        sectionCode: anchor.code,
        assetCode: `${anchor.code}-TRACK-UP-14`,
        assetType: 'TRACK',
        assetName: 'Up line track panel km 14.2-14.6',
        kmFrom: 14.2,
        kmTo: 14.6,
        criticality: 5,
        defectType: 'RAIL_WEAR',
        taskType: 'RAIL_GRINDING',
        title: 'Rail grinding at km 14.2-14.6 (up line)',
        severity: 'HIGH',
        safetyCritical: false,
        speedRestrictionKmph: 60,
        detectedAt: isoAt(epochMs, -3 * 24 * 60),
        dueAt: isoAt(epochMs, 4 * 24 * 60),
        requestedDurationMinutes: 75,
        requiresLineBlock: true,
        requiresPowerBlock: false,
        requiresDisconnection: false,
      });

      // Demo situation 5 - predicted duration far exceeds every usable window.
      records.push({
        externalId: 'TMS-DEF-002',
        sectionCode: anchor.code,
        assetCode: `${anchor.code}-TRACK-DN-19`,
        assetType: 'TRACK',
        assetName: 'Down line deep screening stretch km 19.0-20.4',
        kmFrom: 19.0,
        kmTo: 20.4,
        criticality: 4,
        defectType: 'BALLAST_DEFICIENCY',
        taskType: 'BALLAST_RENEWAL',
        title: 'Deep screening and ballast renewal km 19.0-20.4',
        severity: 'MEDIUM',
        safetyCritical: false,
        speedRestrictionKmph: null,
        detectedAt: isoAt(epochMs, -12 * 24 * 60),
        dueAt: isoAt(epochMs, 9 * 24 * 60),
        // Deliberately longer than any COA window in the fixture set.
        requestedDurationMinutes: 600,
        requiresLineBlock: true,
        requiresPowerBlock: false,
        requiresDisconnection: false,
      });

      // An overdue high-severity item so the priority engine has a clear winner.
      records.push({
        externalId: 'TMS-DEF-003',
        sectionCode: anchor.code,
        assetCode: `${anchor.code}-WELD-07`,
        assetType: 'TRACK',
        assetName: 'Alumino-thermic weld joint W-07',
        kmFrom: 15.8,
        kmTo: 15.8,
        criticality: 5,
        defectType: 'WELD_DEFECT',
        taskType: 'WELD_REPAIR',
        title: 'Weld repair at joint W-07 (overdue)',
        severity: 'CRITICAL',
        safetyCritical: true,
        speedRestrictionKmph: 30,
        detectedAt: isoAt(epochMs, -21 * 24 * 60),
        dueAt: isoAt(epochMs, -6 * 24 * 60),
        requestedDurationMinutes: 60,
        requiresLineBlock: true,
        requiresPowerBlock: false,
        requiresDisconnection: false,
      });

      counter = 4;
    }

    // Bulk fixtures spread across the whole network.
    for (const section of sections) {
      const perSection = intBetween(random, 3, 5);

      for (let index = 0; index < perSection; index += 1) {
        const assetType = pick(random, ASSET_TYPES);
        const defectType = pick(random, DEFECT_TYPES);
        const taskType = pick(random, TASK_TYPES);
        const severity = pick(random, ['LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'HIGH', 'CRITICAL']);
        const safetyCritical = severity === 'CRITICAL' && chance(random, 0.6);
        const kmFrom = floatBetween(random, Number(section.startKm), Number(section.endKm) - 0.5, 1);
        const detectedOffsetDays = -intBetween(random, 2, 40);
        const dueOffsetDays = intBetween(random, -8, 20);

        records.push({
          externalId: `TMS-DEF-${String(counter).padStart(3, '0')}`,
          sectionCode: section.code,
          assetCode: `${section.code}-TRK-${String(index + 1).padStart(2, '0')}`,
          assetType,
          assetName: `${assetType.replaceAll('_', ' ')} ${section.code} #${index + 1}`,
          kmFrom,
          kmTo: Number((kmFrom + floatBetween(random, 0.1, 0.6, 1)).toFixed(1)),
          criticality: intBetween(random, 2, 5),
          defectType,
          taskType,
          title: `${taskType.replaceAll('_', ' ').toLowerCase()} on ${section.code}`,
          severity,
          safetyCritical,
          speedRestrictionKmph: chance(random, 0.3) ? pick(random, [30, 45, 60, 75]) : null,
          detectedAt: isoAt(epochMs, detectedOffsetDays * 24 * 60),
          dueAt: isoAt(epochMs, dueOffsetDays * 24 * 60),
          requestedDurationMinutes: pick(random, [45, 60, 75, 90, 120, 150]),
          requiresLineBlock: true,
          requiresPowerBlock: false,
          requiresDisconnection: false,
        });

        counter += 1;
      }
    }

    return records;
  },
};
