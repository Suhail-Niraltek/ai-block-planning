import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { coaAdapter } from '../src/modules/sources/adapters/coa.adapter.js';
import {
  createRandom,
  deriveSeed,
  planningEpoch,
  toMysqlDateTime,
} from '../src/modules/sources/adapters/deterministic.js';
import { goodsForecastAdapter } from '../src/modules/sources/adapters/goods-forecast.adapter.js';
import { smmsAdapter } from '../src/modules/sources/adapters/smms.adapter.js';
import { tdmsAdapter } from '../src/modules/sources/adapters/tdms.adapter.js';
import { timetableAdapter } from '../src/modules/sources/adapters/timetable.adapter.js';
import { tmsAdapter } from '../src/modules/sources/adapters/tms.adapter.js';
import { SCHEMA_BY_KIND, sourceCodeSchema } from '../src/modules/sources/sources.validation.js';
import {
  compareQuerySchema,
  planningRequestSchema,
} from '../src/modules/planning/planning.validation.js';

const SECTIONS = [
  { id: 'S1', code: 'SEC-A-01', lineType: 'DOUBLE', electrified: 1, startKm: 10, endKm: 24.5, corridorCode: 'COR-A' },
  { id: 'S2', code: 'SEC-A-02', lineType: 'DOUBLE', electrified: 1, startKm: 24.5, endKm: 41.2, corridorCode: 'COR-A' },
  { id: 'S3', code: 'SEC-B-01', lineType: 'SINGLE', electrified: 1, startKm: 5, endKm: 19.8, corridorCode: 'COR-B' },
];

const CORRIDORS = [
  { id: 'C1', code: 'COR-A', importanceScore: 5 },
  { id: 'C2', code: 'COR-B', importanceScore: 3 },
];

const CONTEXT = {
  sections: SECTIONS,
  corridors: CORRIDORS,
  epochMs: Date.UTC(2026, 8, 1),
  seed: 26027,
};

const ADAPTERS = [
  tmsAdapter,
  smmsAdapter,
  tdmsAdapter,
  coaAdapter,
  timetableAdapter,
  goodsForecastAdapter,
];

describe('deterministic helpers', () => {
  it('produces the same sequence for the same seed', () => {
    const draw = (seed, count) => {
      const random = createRandom(seed);
      return Array.from({ length: count }, () => random());
    };

    assert.deepEqual(draw(42, 10), draw(42, 10));
  });

  it('produces different sequences for different seeds', () => {
    const a = createRandom(1);
    const b = createRandom(2);

    assert.notEqual(a(), b());
  });

  it('derives a stable but distinct sub-seed per label', () => {
    assert.equal(deriveSeed(26027, 'TMS'), deriveSeed(26027, 'TMS'));
    assert.notEqual(deriveSeed(26027, 'TMS'), deriveSeed(26027, 'SMMS'));
  });

  it('anchors the planning epoch to midnight UTC', () => {
    const epoch = planningEpoch(new Date('2026-09-15T17:42:11Z'));

    assert.equal(new Date(epoch).toISOString(), '2026-09-15T00:00:00.000Z');
  });

  it('formats MySQL DATETIME(3) in UTC', () => {
    assert.equal(toMysqlDateTime('2026-09-02T19:00:00.000Z'), '2026-09-02 19:00:00.000');
  });
});

describe('source adapters', () => {
  for (const adapter of ADAPTERS) {
    describe(adapter.code, () => {
      it('produces records that all pass validation', () => {
        const schema = SCHEMA_BY_KIND[adapter.kind];
        const records = adapter.generate(CONTEXT);

        assert.ok(records.length > 0, 'the adapter must produce fixtures');

        const failures = [];

        for (const record of records) {
          const result = schema.safeParse(record);

          if (!result.success) {
            failures.push({
              externalId: record.externalId,
              issues: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
            });
          }
        }

        assert.deepEqual(failures, [], `every ${adapter.code} fixture must be valid`);
      });

      it('is deterministic: the same context produces identical records', () => {
        assert.deepEqual(adapter.generate(CONTEXT), adapter.generate(CONTEXT));
      });

      it('emits unique external ids so upserts are idempotent', () => {
        const records = adapter.generate(CONTEXT);
        const ids = records.map((record) => record.externalId);

        assert.equal(new Set(ids).size, ids.length, 'duplicate external ids would break the upsert');
      });

      it('only references sections and corridors that exist', () => {
        const sectionCodes = new Set(SECTIONS.map((section) => section.code));
        const corridorCodes = new Set(CORRIDORS.map((corridor) => corridor.code));

        for (const record of adapter.generate(CONTEXT)) {
          if (record.sectionCode) {
            assert.ok(sectionCodes.has(record.sectionCode), `unknown section ${record.sectionCode}`);
          }

          if (record.corridorCode) {
            assert.ok(
              corridorCodes.has(record.corridorCode),
              `unknown corridor ${record.corridorCode}`,
            );
          }
        }
      });
    });
  }

  it('gives every maintenance task at least one block requirement', () => {
    for (const adapter of [tmsAdapter, smmsAdapter, tdmsAdapter]) {
      for (const record of adapter.generate(CONTEXT)) {
        assert.ok(
          record.requiresLineBlock || record.requiresPowerBlock || record.requiresDisconnection,
          `${record.externalId} requires no block at all`,
        );
      }
    }
  });

  it('always offers power isolation and disconnection on the integration section', () => {
    const anchorWindows = coaAdapter
      .generate(CONTEXT)
      .filter((window) => window.sectionCode === SECTIONS[0].code);

    assert.ok(anchorWindows.length > 0);

    for (const window of anchorWindows) {
      assert.equal(window.powerIsolationAvailable, true);
      assert.equal(window.signallingDisconnectionAvailable, true);
    }
  });

  it('never offers power isolation on the designated no-power section', () => {
    const windows = coaAdapter
      .generate(CONTEXT)
      .filter((window) => window.sectionCode === SECTIONS[1].code);

    assert.ok(windows.length > 0);

    for (const window of windows) {
      assert.equal(window.powerIsolationAvailable, false);
    }
  });

  it('always runs the window-splitting passenger path on the integration section', () => {
    const movements = timetableAdapter
      .generate(CONTEXT)
      .filter(
        (movement) => movement.sectionCode === SECTIONS[0].code && movement.trainNumber === '12002',
      );

    // One per day across the published horizon.
    assert.ok(movements.length >= 30, `expected a daily path, got ${movements.length}`);

    for (const movement of movements) {
      assert.equal(movement.protected, true);
    }
  });

  it('rejects a malformed record rather than storing it', () => {
    const schema = SCHEMA_BY_KIND.BLOCK_WINDOWS;

    const result = schema.safeParse({
      externalId: 'BAD-1',
      corridorCode: 'COR-A',
      sectionCode: 'SEC-A-01',
      // End before start.
      startsAt: '2026-09-02T22:00:00Z',
      endsAt: '2026-09-02T19:00:00Z',
      availableLineCount: 1,
      powerIsolationAvailable: true,
      signallingDisconnectionAvailable: true,
      confidence: 0.9,
      status: 'AVAILABLE',
    });

    assert.equal(result.success, false);
  });

  it('accepts only the six required source codes', () => {
    for (const code of ['TMS', 'SMMS', 'TDMS', 'COA', 'TIMETABLE', 'GOODS_FORECAST']) {
      assert.equal(sourceCodeSchema.safeParse(code).success, true);
    }

    assert.equal(sourceCodeSchema.safeParse('BDMS').success, false);
  });
});

describe('planning API validation', () => {
  const validRequest = {
    horizonType: 'WEEKLY',
    horizonStart: '2026-08-31T18:30:00Z',
    horizonEnd: '2026-09-07T18:30:00Z',
  };

  it('accepts a well-formed weekly request', () => {
    assert.equal(planningRequestSchema.safeParse(validRequest).success, true);
  });

  it('accepts a request with no explicit end, which the service derives', () => {
    const result = planningRequestSchema.safeParse({
      horizonType: 'MONTHLY',
      horizonStart: '2026-09-01T00:00:00Z',
    });

    assert.equal(result.success, true);
  });

  it('rejects an unknown horizon type', () => {
    const result = planningRequestSchema.safeParse({ ...validRequest, horizonType: 'DAILY' });

    assert.equal(result.success, false);
  });

  it('rejects an end that is not after the start', () => {
    const result = planningRequestSchema.safeParse({
      ...validRequest,
      horizonEnd: '2026-08-30T18:30:00Z',
    });

    assert.equal(result.success, false);
    assert.match(result.error.issues[0].message, /after/);
  });

  it('rejects a non-instant start date', () => {
    const result = planningRequestSchema.safeParse({ ...validRequest, horizonStart: 'next monday' });

    assert.equal(result.success, false);
  });

  it('rejects corridor ids that are not uuids', () => {
    const result = planningRequestSchema.safeParse({ ...validRequest, corridorIds: ['COR-A'] });

    assert.equal(result.success, false);
  });

  it('requires both plan ids on the comparison endpoint', () => {
    assert.equal(
      compareQuerySchema.safeParse({ optimizedPlanId: '4f1b8f34-1a4c-4a53-9b6f-0f4e5a2c3d11' })
        .success,
      false,
    );
  });
});
