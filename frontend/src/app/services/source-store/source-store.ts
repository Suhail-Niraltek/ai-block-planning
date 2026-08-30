import { computed, inject, Service, signal } from '@angular/core';
import { Api, ApiError } from '../../core/api/api';
import { HealthStatus, SourceCode, SourceSystem, SyncResult } from '../../core/models/source';

/** The six inputs the problem statement requires, in dashboard order. */
const REQUIRED_SOURCES: readonly SourceCode[] = [
  'TMS',
  'SMMS',
  'TDMS',
  'COA',
  'TIMETABLE',
  'GOODS_FORECAST',
];

@Service()
export class SourceStore {
  private readonly api = inject(Api);

  private readonly _sources = signal<readonly SourceSystem[]>([]);
  private readonly _health = signal<HealthStatus | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _syncing = signal<ReadonlySet<SourceCode>>(new Set());
  private readonly _lastResults = signal<Readonly<Record<string, SyncResult>>>({});

  readonly sources = this._sources.asReadonly();
  readonly health = this._health.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly syncing = this._syncing.asReadonly();
  readonly lastResults = this._lastResults.asReadonly();

  readonly apiOnline = computed(() => this._health()?.status === 'ok');
  readonly databaseConnected = computed(() => this._health()?.database === 'connected');

  /** Every required source, whether or not the backend has registered it yet. */
  readonly requiredSources = computed(() => {
    const bySource = new Map(this._sources().map((source) => [source.code, source]));

    return REQUIRED_SOURCES.map((code) => ({
      code,
      source: bySource.get(code) ?? null,
      result: this._lastResults()[code] ?? null,
      isSyncing: this._syncing().has(code),
    }));
  });

  readonly syncedCount = computed(
    () => this._sources().filter((source) => source.lastSyncStatus === 'COMPLETED').length,
  );

  readonly failedCount = computed(
    () => this._sources().filter((source) => source.lastSyncStatus === 'FAILED').length,
  );

  readonly allSourcesSynced = computed(() => this.syncedCount() === REQUIRED_SOURCES.length);

  readonly anySyncing = computed(() => this._syncing().size > 0);

  async loadHealth(): Promise<void> {
    try {
      this._health.set(await this.api.get<HealthStatus>('/health'));
    } catch (error) {
      this._health.set(null);
      this._error.set(this.messageOf(error));
    }
  }

  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);

    try {
      this._sources.set(await this.api.get<readonly SourceSystem[]>('/sources'));
    } catch (error) {
      this._error.set(this.messageOf(error));
    } finally {
      this._loading.set(false);
    }
  }

  async sync(code: SourceCode): Promise<void> {
    this._syncing.update((current) => new Set(current).add(code));
    this._error.set(null);

    try {
      const result = await this.api.post<SyncResult>(`/sources/${code}/sync`);
      this._lastResults.update((current) => ({ ...current, [code]: result }));
      await this.load();
    } catch (error) {
      this._error.set(`${code}: ${this.messageOf(error)}`);
    } finally {
      this._syncing.update((current) => {
        const next = new Set(current);
        next.delete(code);
        return next;
      });
    }
  }

  async syncAll(): Promise<void> {
    this._syncing.set(new Set(REQUIRED_SOURCES));
    this._error.set(null);

    try {
      const results = await this.api.post<readonly SyncResult[]>('/sources/sync-all');

      this._lastResults.set(
        Object.fromEntries(results.map((result) => [result.sourceCode, result])),
      );

      await this.load();
    } catch (error) {
      this._error.set(this.messageOf(error));
    } finally {
      this._syncing.set(new Set());
    }
  }

  private messageOf(error: unknown): string {
    if (error instanceof ApiError) return error.message;
    if (error instanceof Error) return error.message;
    return 'Unexpected error';
  }
}
