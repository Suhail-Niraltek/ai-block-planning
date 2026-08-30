import { chance, createRandom, deriveSeed, intBetween, isoAt, pick } from './deterministic.js';

const ASSET_TYPES = ['POINT_MACHINE', 'SIGNAL', 'TRACK_CIRCUIT', 'AXLE_COUNTER', 'RELAY_RACK'];

const TASK_TYPES = [
  'POINT_MACHINE_OVERHAUL',
  'SIGNAL_LAMP_REPLACEMENT',
  'TRACK_CIRCUIT_TUNING',
  'AXLE_COUNTER_CALIBRATION',
  'RELAY_TESTING',
  'CABLE_MEGGERING',
];

const DEFECT_TYPES = [
  'POINT_OBSTRUCTION',
  'SIGNAL_LAMP_FAILURE',
  'TRACK_CIRCUIT_DROP',
  'COUNTER_MISMATCH',
  'INSULATION_LOW',
];

/**
 * SMMS - Signalling Maintenance & Management System.
 * Supplies Signal & Telecommunication (SNT) assets, defects, and tasks.
 * Most SNT work needs a signalling disconnection as well as a line block.
 */
export const smmsAdapter = {
  code: 'SMMS',
  name: 'Signalling Maintenance & Management System',
  department: 'SNT',
  kind: 'MAINTENANCE',
  adapterType: 'MOCK',

  generate(context) {
    const { sections, epochMs, seed } = context;
    const random = createRandom(deriveSeed(seed, 'SMMS'));
    const records = [];

    let counter = 1;
    const anchor = sections[0];

    if (anchor) {
      // Demo situation 2 - a critical SNT task the optimizer must prioritise.
      records.push({
        externalId: 'SMMS-TASK-001',
        sectionCode: anchor.code,
        assetCode: `${anchor.code}-POINT-MACHINE-22`,
        assetType: 'POINT_MACHINE',
        assetName: 'Point machine 22 (facing, up line)',
        criticality: 5,
        defectType: 'POINT_OBSTRUCTION',
        taskType: 'POINT_MACHINE_OVERHAUL',
        title: 'Point machine 22 overhaul - obstruction detected',
        severity: 'CRITICAL',
        safetyCritical: true,
        speedRestrictionKmph: 15,
        detectedAt: isoAt(epochMs, -5 * 24 * 60),
        dueAt: isoAt(epochMs, 2 * 24 * 60),
        requestedDurationMinutes: 60,
        requiresLineBlock: true,
        requiresPowerBlock: false,
        requiresDisconnection: true,
      });

      // Demo situation 1 - the SNT half of the integrated block.
      records.push({
        externalId: 'SMMS-TASK-002',
        sectionCode: anchor.code,
        assetCode: `${anchor.code}-TRACK-CIRCUIT-09`,
        assetType: 'TRACK_CIRCUIT',
        assetName: 'Track circuit TC-09',
        criticality: 4,
        defectType: 'TRACK_CIRCUIT_DROP',
        taskType: 'TRACK_CIRCUIT_TUNING',
        title: 'Track circuit TC-09 tuning and bonding check',
        severity: 'HIGH',
        safetyCritical: false,
        speedRestrictionKmph: null,
        detectedAt: isoAt(epochMs, -4 * 24 * 60),
        dueAt: isoAt(epochMs, 5 * 24 * 60),
        requestedDurationMinutes: 45,
        requiresLineBlock: true,
        requiresPowerBlock: false,
        requiresDisconnection: true,
      });

      // Demo situation 6 - a disconnection-only task on a section whose windows
      // never offer signalling disconnection, so it stays unscheduled with a reason.
      const lastSection = sections[sections.length - 1];

      records.push({
        externalId: 'SMMS-TASK-003',
        sectionCode: lastSection.code,
        assetCode: `${lastSection.code}-RELAY-RACK-02`,
        assetType: 'RELAY_RACK',
        assetName: 'Relay rack R-02 interlocking',
        criticality: 4,
        defectType: 'INSULATION_LOW',
        taskType: 'RELAY_TESTING',
        title: 'Interlocking relay rack R-02 periodic testing',
        severity: 'MEDIUM',
        safetyCritical: false,
        speedRestrictionKmph: null,
        detectedAt: isoAt(epochMs, -9 * 24 * 60),
        dueAt: isoAt(epochMs, 6 * 24 * 60),
        requestedDurationMinutes: 90,
        requiresLineBlock: false,
        requiresPowerBlock: false,
        requiresDisconnection: true,
      });

      counter = 4;
    }

    for (const section of sections) {
      const perSection = intBetween(random, 2, 4);

      for (let index = 0; index < perSection; index += 1) {
        const assetType = pick(random, ASSET_TYPES);
        const taskType = pick(random, TASK_TYPES);
        const severity = pick(random, ['LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'CRITICAL']);
        const requiresLineBlock = chance(random, 0.7);
        // Every task must need at least one kind of block; bench work that needs
        // no line block always needs the signalling disconnection instead.
        const requiresDisconnection = requiresLineBlock ? chance(random, 0.8) : true;

        records.push({
          externalId: `SMMS-TASK-${String(counter).padStart(3, '0')}`,
          sectionCode: section.code,
          assetCode: `${section.code}-SNT-${String(index + 1).padStart(2, '0')}`,
          assetType,
          assetName: `${assetType.replaceAll('_', ' ')} ${section.code} #${index + 1}`,
          criticality: intBetween(random, 3, 5),
          defectType: pick(random, DEFECT_TYPES),
          taskType,
          title: `${taskType.replaceAll('_', ' ').toLowerCase()} on ${section.code}`,
          severity,
          safetyCritical: severity === 'CRITICAL',
          speedRestrictionKmph: chance(random, 0.2) ? pick(random, [15, 30, 45]) : null,
          detectedAt: isoAt(epochMs, -intBetween(random, 2, 30) * 24 * 60),
          dueAt: isoAt(epochMs, intBetween(random, -5, 18) * 24 * 60),
          requestedDurationMinutes: pick(random, [30, 45, 60, 75, 90]),
          requiresLineBlock,
          requiresPowerBlock: false,
          requiresDisconnection,
        });

        counter += 1;
      }
    }

    return records;
  },
};
