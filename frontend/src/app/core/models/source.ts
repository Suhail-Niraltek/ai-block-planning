export type SourceCode = 'TMS' | 'SMMS' | 'TDMS' | 'COA' | 'TIMETABLE' | 'GOODS_FORECAST';

export type SyncStatus = 'NEVER' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type Department = 'ENG' | 'TRD' | 'SNT';

export interface SourceSystem {
  readonly id: string;
  readonly code: SourceCode;
  readonly name: string;
  readonly adapterType: 'MOCK' | 'JSON' | 'REST';
  readonly lastSyncAt: string | null;
  readonly lastSyncStatus: SyncStatus;
  readonly recordCount: number;
  readonly department: Department | null;
  readonly kind: string | null;
  readonly synthetic: boolean;
}

export interface RejectedRecord {
  readonly externalId: string;
  readonly reason: string;
}

export interface SyncResult {
  readonly syncRunId: string;
  readonly sourceCode: SourceCode;
  readonly sourceName: string;
  readonly kind: string;
  readonly receivedCount: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly rejectedSample: readonly RejectedRecord[];
  readonly recordCount: number;
  readonly synthetic: boolean;
}

export interface SyncRun {
  readonly id: string;
  readonly sourceSystemId: string;
  readonly sourceCode: SourceCode;
  readonly sourceName: string;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  readonly receivedCount: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly errorMessage: string | null;
}

export interface HealthStatus {
  readonly status: 'ok' | 'degraded';
  readonly database: 'connected' | 'disconnected';
  readonly databaseError: string | null;
  readonly dataOrigin: string;
  readonly notice: string;
}
