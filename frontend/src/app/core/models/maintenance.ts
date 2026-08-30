import { Department, SourceCode } from './source';

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type TaskStatus = 'READY' | 'PLANNED' | 'COMPLETED' | 'DEFERRED';

export type PrioritySource = 'ML' | 'RULE_FALLBACK';

export interface PriorityReason {
  readonly factor: string;
  readonly contribution: number;
  readonly detail: string;
}

export interface MaintenanceTask {
  readonly id: string;
  readonly externalId: string;
  readonly department: Department;
  readonly taskType: string;
  readonly title: string;
  readonly earliestStart: string;
  readonly dueAt: string;
  readonly requestedDurationMinutes: number;
  readonly predictedDurationMinutes: number | null;
  readonly predictedDurationSampleCount: number;
  readonly requiresLineBlock: boolean;
  readonly requiresPowerBlock: boolean;
  readonly requiresDisconnection: boolean;
  readonly severity: Severity;
  readonly criticality: number;
  readonly safetyCritical: boolean;
  readonly speedRestrictionKmph: number | null;
  readonly repeatCount: number;
  readonly daysOverdue: number;
  readonly priorityScore: number;
  readonly prioritySource: PrioritySource;
  readonly priorityReasons: readonly PriorityReason[];
  readonly status: TaskStatus;
  readonly sectionId: string;
  readonly sectionCode: string;
  readonly sectionName: string;
  readonly assetId: string;
  readonly assetCode: string;
  readonly assetType: string;
  readonly corridorId: string;
  readonly corridorCode: string;
  readonly corridorName: string;
  readonly corridorImportance: number;
  readonly sourceCode: SourceCode;
  readonly sourceName: string;
}

export interface TaskFilters {
  readonly department: Department | null;
  readonly severity: Severity | null;
  readonly sectionId: string | null;
  readonly status: TaskStatus | null;
  readonly overdueOnly: boolean;
  readonly minPriority: number;
}

export interface DepartmentSummary {
  readonly department: Department;
  readonly taskCount: number;
  readonly criticalCount: number;
  readonly overdueCount: number;
  readonly averagePriorityScore: number;
}

export interface MaintenanceSummary {
  readonly totals: {
    readonly totalTasks: number;
    readonly readyTasks: number;
    readonly plannedTasks: number;
    readonly deferredTasks: number;
    readonly criticalTasks: number;
    readonly safetyCriticalTasks: number;
    readonly overdueTasks: number;
    readonly engTasks: number;
    readonly trdTasks: number;
    readonly sntTasks: number;
    readonly mlScoredTasks: number;
    readonly ruleScoredTasks: number;
    readonly averagePriorityScore: number;
  };
  readonly byDepartment: readonly DepartmentSummary[];
  readonly bySeverity: readonly { readonly severity: Severity; readonly taskCount: number }[];
}

export interface RecalculateResult {
  readonly tasksScored: number;
  readonly mlScored: number;
  readonly ruleScored: number;
  readonly historyRows: number;
  readonly minimumHistoryRows: number;
  readonly model: {
    readonly available: boolean;
    readonly reason: string | null;
    readonly metrics: {
      readonly trainRows: number;
      readonly validationRows: number;
      readonly validationAccuracy: number;
      readonly validationLogLoss: number;
      readonly validationRocAuc: number | null;
      readonly validationPositiveRate: number;
    } | null;
  };
  readonly dataOrigin: string;
  readonly note: string;
}
