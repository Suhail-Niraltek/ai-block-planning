import { TestBed } from '@angular/core/testing';
import { Api, ApiError } from '../../core/api/api';
import { SourceStore } from './source-store';

/** Minimal stand-in for the API so the store is tested in isolation. */
class FakeApi {
  getResponses = new Map<string, unknown>();
  postResponses = new Map<string, unknown>();
  getError: unknown = null;
  postError: unknown = null;
  postCalls: string[] = [];

  async get<T>(path: string): Promise<T> {
    if (this.getError) throw this.getError;
    return this.getResponses.get(path) as T;
  }

  async post<T>(path: string): Promise<T> {
    this.postCalls.push(path);
    if (this.postError) throw this.postError;
    return this.postResponses.get(path) as T;
  }
}

function sourceRow(code: string, status: string, recordCount = 10) {
  return {
    id: `id-${code}`,
    code,
    name: code,
    adapterType: 'MOCK',
    lastSyncAt: '2026-08-30 10:00:00.000',
    lastSyncStatus: status,
    recordCount,
    department: null,
    kind: null,
    synthetic: true,
  };
}

describe('SourceStore', () => {
  let service: SourceStore;
  let api: FakeApi;

  beforeEach(() => {
    api = new FakeApi();

    TestBed.configureTestingModule({
      providers: [{ provide: Api, useValue: api }],
    });

    service = TestBed.inject(SourceStore);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('starts empty with no error', () => {
    expect(service.sources()).toEqual([]);
    expect(service.error()).toBeNull();
    expect(service.loading()).toBe(false);
    expect(service.syncedCount()).toBe(0);
    expect(service.allSourcesSynced()).toBe(false);
  });

  it('always lists all six required sources, even before any are registered', () => {
    const codes = service.requiredSources().map((entry) => entry.code);

    expect(codes).toEqual(['TMS', 'SMMS', 'TDMS', 'COA', 'TIMETABLE', 'GOODS_FORECAST']);
    expect(service.requiredSources().every((entry) => entry.source === null)).toBe(true);
  });

  it('counts synced and failed sources from the loaded rows', async () => {
    api.getResponses.set('/sources', [
      sourceRow('TMS', 'COMPLETED'),
      sourceRow('SMMS', 'COMPLETED'),
      sourceRow('TDMS', 'FAILED'),
    ]);

    await service.load();

    expect(service.syncedCount()).toBe(2);
    expect(service.failedCount()).toBe(1);
    expect(service.allSourcesSynced()).toBe(false);
  });

  it('reports allSourcesSynced only when all six have completed', async () => {
    api.getResponses.set('/sources', [
      sourceRow('TMS', 'COMPLETED'),
      sourceRow('SMMS', 'COMPLETED'),
      sourceRow('TDMS', 'COMPLETED'),
      sourceRow('COA', 'COMPLETED'),
      sourceRow('TIMETABLE', 'COMPLETED'),
      sourceRow('GOODS_FORECAST', 'COMPLETED'),
    ]);

    await service.load();

    expect(service.allSourcesSynced()).toBe(true);
  });

  it('records the API error message when loading fails', async () => {
    api.getError = new ApiError('DATABASE_UNAVAILABLE', 'Cannot reach MySQL');

    await service.load();

    expect(service.error()).toBe('Cannot reach MySQL');
    expect(service.loading()).toBe(false);
  });

  it('exposes health and derives online flags from it', async () => {
    api.getResponses.set('/health', {
      status: 'ok',
      database: 'connected',
      databaseError: null,
      dataOrigin: 'SYNTHETIC',
      notice: 'synthetic',
    });

    await service.loadHealth();

    expect(service.apiOnline()).toBe(true);
    expect(service.databaseConnected()).toBe(true);
  });

  it('reports the API as offline when health cannot be read', async () => {
    api.getError = new ApiError('NETWORK_ERROR', 'Cannot reach the planning API.');

    await service.loadHealth();

    expect(service.health()).toBeNull();
    expect(service.apiOnline()).toBe(false);
  });

  it('stores the sync result and clears the syncing flag afterwards', async () => {
    api.postResponses.set('/sources/TMS/sync', {
      syncRunId: 'run-1',
      sourceCode: 'TMS',
      sourceName: 'Track Management System',
      kind: 'MAINTENANCE',
      receivedCount: 39,
      acceptedCount: 39,
      rejectedCount: 0,
      rejectedSample: [],
      recordCount: 39,
      synthetic: true,
    });

    api.getResponses.set('/sources', [sourceRow('TMS', 'COMPLETED', 39)]);

    await service.sync('TMS');

    expect(service.lastResults()['TMS'].acceptedCount).toBe(39);
    expect(service.syncing().has('TMS')).toBe(false);
    expect(service.anySyncing()).toBe(false);
    expect(service.error()).toBeNull();
  });

  it('prefixes a failed sync error with the source code', async () => {
    api.postError = new ApiError('CONFLICT', 'No sections are seeded.');

    await service.sync('COA');

    expect(service.error()).toBe('COA: No sections are seeded.');
    expect(service.syncing().has('COA')).toBe(false);
  });

  it('syncs all six sources through the batch endpoint', async () => {
    api.postResponses.set('/sources/sync-all', []);
    api.getResponses.set('/sources', []);

    await service.syncAll();

    expect(api.postCalls).toContain('/sources/sync-all');
    expect(service.anySyncing()).toBe(false);
  });
});
