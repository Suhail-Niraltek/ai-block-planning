import { PrioritySource, Severity } from './maintenance';
import { Department } from './source';

export type HorizonType = 'WEEKLY' | 'MONTHLY';

export type SolverStatus =
  | 'OPTIMAL'
  | 'FEASIBLE'
  | 'FALLBACK_FEASIBLE'
  | 'INFEASIBLE'
  | 'FAILED';

export type BlockType = 'LINE' | 'POWER' | 'DISCONNECTION' | 'INTEGRATED';

export type UnscheduledReason =
  | 'NO_BLOCK_WINDOW'
  | 'TRAIN_CONFLICT'
  | 'INSUFFICIENT_DURATION'
  | 'POWER_ISOLATION_UNAVAILABLE'
  | 'DISCONNECTION_UNAVAILABLE'
  | 'INCOMPATIBLE_TASK'
  | 'OUTSIDE_HORIZON';

export interface PlanningRequest {
  readonly horizonType: HorizonType;
  readonly horizonStart: string;
  readonly horizonEnd?: string;
  readonly corridorIds?: readonly string[];
}

export interface PlanMetrics {
  readonly totalTasks: number;
  readonly scheduledTasks: number;
  readonly unscheduledTasks: number;
  readonly criticalTasksScheduled: number;
  readonly criticalTasksUnscheduled: number;
  readonly totalBlockCount: number;
  readonly totalBlockMinutes: number;
  readonly tasksPerBlock: number;
  readonly multiDepartmentBlockCount: number;
  readonly trainImpactScore: number;
  readonly assetAvailabilityPercentage: number;
  readonly averageUtilizationPercentage?: number;
}

export interface ComparisonRow {
  readonly key: string;
  readonly label: string;
  readonly higherIsBetter: boolean;
  readonly optimized: number;
  readonly baseline: number;
  readonly delta: number;
  /** null means unchanged, which is not the same as "not improved". */
  readonly improved: boolean | null;
}

export interface PlanningStage {
  readonly stage: string;
  readonly at: string;
}

export interface PlanningInputs {
  readonly taskCount: number;
  readonly blockWindowCount: number;
  readonly trainMovementCount: number;
  readonly protectedMovementCount: number;
  readonly goodsForecastBuckets: number;
  readonly usableSegmentCount: number;
  readonly feasibleOptionCount: number;
  readonly sectionCount: number;
}

export interface PlanningRunResult {
  readonly runId: string;
  readonly status: string;
  readonly horizonType: HorizonType;
  readonly horizonStart: string;
  readonly horizonEnd: string;
  readonly solverType: 'GLPK' | 'FALLBACK';
  readonly solverStatus: SolverStatus;
  readonly solverNote: string | null;
  readonly stages: readonly PlanningStage[];
  readonly inputs: PlanningInputs;
  readonly optimizedPlanId: string;
  readonly baselinePlanId: string;
  readonly optimizedMetrics: PlanMetrics;
  readonly baselineMetrics: PlanMetrics;
  readonly comparison: readonly ComparisonRow[];
  readonly dataOrigin: string;
}

export interface PlanningRun {
  readonly id: string;
  readonly horizonType: HorizonType;
  readonly horizonStart: string;
  readonly horizonEnd: string;
  readonly status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  readonly solverType: 'GLPK' | 'FALLBACK' | null;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly errorMessage: string | null;
  readonly plans?: readonly Plan[];
}

export interface Plan {
  readonly id: string;
  readonly planningRunId: string;
  readonly planType: 'OPTIMIZED' | 'BASELINE';
  readonly horizonType: HorizonType;
  readonly horizonStart: string;
  readonly horizonEnd: string;
  readonly totalTasks: number;
  readonly scheduledTasks: number;
  readonly unscheduledTasks: number;
  readonly criticalTasksScheduled: number;
  readonly criticalTasksUnscheduled: number;
  readonly totalBlockCount: number;
  readonly totalBlockMinutes: number;
  readonly assetAvailabilityPercentage: number;
  readonly trainImpactScore: number;
  readonly multiDepartmentBlockCount: number;
  readonly solverStatus: SolverStatus;
  readonly createdAt: string;
}

export interface PlanBlockTask {
  readonly maintenanceTaskId: string;
  readonly plannedStart: string;
  readonly plannedEnd: string;
  readonly sequenceNumber: number;
  readonly title: string;
  readonly department: Department;
  readonly severity: Severity;
  readonly taskType: string;
  readonly priorityScore: number;
  readonly prioritySource: PrioritySource;
  readonly predictedDurationMinutes: number;
  readonly requestedDurationMinutes: number;
  readonly safetyCritical: boolean;
  readonly assignmentReason: {
    readonly reason: string;
    readonly predictedDurationMinutes: number;
    readonly priorityScore: number;
    readonly prioritySource: PrioritySource;
    readonly sharesBlockWith: readonly Department[];
  } | null;
}

export interface PlanBlock {
  readonly id: string;
  readonly blockWindowId: string;
  readonly corridorId: string;
  readonly corridorCode: string;
  readonly sectionId: string;
  readonly sectionCode: string;
  readonly sectionName: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly blockType: BlockType;
  readonly departments: readonly Department[];
  readonly utilizationPercentage: number;
  readonly trainImpactScore: number;
  readonly tasks: readonly PlanBlockTask[];
}

export interface UnscheduledTask {
  readonly id: string;
  readonly maintenanceTaskId: string;
  readonly reasonCode: UnscheduledReason;
  readonly explanation: string;
  readonly title: string;
  readonly department: Department;
  readonly severity: Severity;
  readonly taskType: string;
  readonly priorityScore: number;
  readonly dueAt: string;
  readonly daysOverdue: number;
  readonly predictedDurationMinutes: number;
  readonly requestedDurationMinutes: number;
  readonly safetyCritical: boolean;
  readonly sectionCode: string;
  readonly sectionName: string;
}

export interface PlanComparison {
  readonly optimized: Plan & { readonly metrics: PlanMetrics };
  readonly baseline: Plan & { readonly metrics: PlanMetrics };
  readonly comparison: readonly ComparisonRow[];
}
