import { computed, inject, Service, signal } from '@angular/core';
import { Api, ApiError } from '../../core/api/api';
import {
  Plan,
  PlanBlock,
  PlanComparison,
  PlanningRequest,
  PlanningRun,
  PlanningRunResult,
  UnscheduledTask,
} from '../../core/models/planning';
import { Department } from '../../core/models/source';

@Service()
export class PlanningStore {
  private readonly api = inject(Api);

  private readonly _run = signal<PlanningRunResult | null>(null);
  private readonly _runs = signal<readonly PlanningRun[]>([]);
  private readonly _plan = signal<Plan | null>(null);
  private readonly _blocks = signal<readonly PlanBlock[]>([]);
  private readonly _unscheduled = signal<readonly UnscheduledTask[]>([]);
  private readonly _comparison = signal<PlanComparison | null>(null);
  private readonly _generating = signal(false);
  private readonly _stage = signal<string | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly run = this._run.asReadonly();
  readonly runs = this._runs.asReadonly();
  readonly plan = this._plan.asReadonly();
  readonly blocks = this._blocks.asReadonly();
  readonly unscheduled = this._unscheduled.asReadonly();
  readonly comparison = this._comparison.asReadonly();
  readonly generating = this._generating.asReadonly();
  readonly stage = this._stage.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  readonly hasPlan = computed(() => this._plan() !== null);

  readonly hasBlocks = computed(() => this._blocks().length > 0);

  /** Only a genuine GLPK optimum may be described as optimal. */
  readonly isOptimal = computed(() => this._plan()?.solverStatus === 'OPTIMAL');

  readonly usedFallback = computed(() => this._plan()?.solverStatus === 'FALLBACK_FEASIBLE');

  readonly criticalUnscheduled = computed(() =>
    this._unscheduled().filter((task) => task.severity === 'CRITICAL'),
  );

  readonly safetyCriticalUnscheduled = computed(() =>
    this._unscheduled().filter((task) => task.safetyCritical),
  );

  /** Unscheduled tasks grouped by reason, largest group first. */
  readonly unscheduledByReason = computed(() => {
    const groups = new Map<string, UnscheduledTask[]>();

    for (const task of this._unscheduled()) {
      const existing = groups.get(task.reasonCode);
      if (existing) existing.push(task);
      else groups.set(task.reasonCode, [task]);
    }

    return [...groups.entries()]
      .map(([reasonCode, tasks]) => ({ reasonCode, tasks }))
      .sort((a, b) => b.tasks.length - a.tasks.length);
  });

  /** Blocks grouped by section, which is how the timeline is laid out. */
  readonly blocksBySection = computed(() => {
    const groups = new Map<string, { sectionCode: string; sectionName: string; blocks: PlanBlock[] }>();

    for (const block of this._blocks()) {
      const existing = groups.get(block.sectionId);

      if (existing) {
        existing.blocks.push(block);
      } else {
        groups.set(block.sectionId, {
          sectionCode: block.sectionCode,
          sectionName: block.sectionName,
          blocks: [block],
        });
      }
    }

    return [...groups.values()].sort((a, b) => a.sectionCode.localeCompare(b.sectionCode));
  });

  readonly integratedBlocks = computed(() =>
    this._blocks().filter((block) => block.departments.length > 1),
  );

  readonly departmentTaskCounts = computed(() => {
    const counts: Record<Department, number> = { ENG: 0, TRD: 0, SNT: 0 };

    for (const block of this._blocks()) {
      for (const task of block.tasks) {
        counts[task.department] += 1;
      }
    }

    return counts;
  });

  async generate(request: PlanningRequest): Promise<PlanningRunResult | null> {
    if (this._generating()) {
      return null;
    }

    this._generating.set(true);
    this._error.set(null);
    this._stage.set('Loading maintenance, corridor and train data');

    try {
      const result = await this.api.post<PlanningRunResult>('/planning/runs', request);

      this._run.set(result);
      this._stage.set('Loading plan detail');

      await this.loadPlan(result.optimizedPlanId);
      await this.loadComparison(result.optimizedPlanId, result.baselinePlanId);

      this._stage.set(null);

      return result;
    } catch (error) {
      this._error.set(this.messageOf(error));
      this._stage.set(null);
      return null;
    } finally {
      this._generating.set(false);
    }
  }

  async loadRuns(): Promise<void> {
    this._loading.set(true);

    try {
      this._runs.set(await this.api.get<readonly PlanningRun[]>('/planning/runs', { limit: 25 }));
    } catch (error) {
      this._error.set(this.messageOf(error));
    } finally {
      this._loading.set(false);
    }
  }

  async loadPlan(planId: string): Promise<void> {
    this._loading.set(true);
    this._error.set(null);

    try {
      const [plan, blocks, unscheduled] = await Promise.all([
        this.api.get<Plan>(`/plans/${planId}`),
        this.api.get<readonly PlanBlock[]>(`/plans/${planId}/blocks`),
        this.api.get<readonly UnscheduledTask[]>(`/plans/${planId}/unscheduled-tasks`),
      ]);

      this._plan.set(plan);
      this._blocks.set(blocks);
      this._unscheduled.set(unscheduled);
    } catch (error) {
      this._error.set(this.messageOf(error));
    } finally {
      this._loading.set(false);
    }
  }

  async loadComparison(optimizedPlanId: string, baselinePlanId: string): Promise<void> {
    try {
      this._comparison.set(
        await this.api.get<PlanComparison>('/plans/compare', { optimizedPlanId, baselinePlanId }),
      );
    } catch (error) {
      this._error.set(this.messageOf(error));
    }
  }

  /** Loads the newest completed run so Compare and Dashboard work on a fresh page load. */
  async loadLatestRun(): Promise<void> {
    await this.loadRuns();

    const latest = this._runs().find((run) => run.status === 'COMPLETED');

    if (!latest) {
      return;
    }

    const detail = await this.api.get<PlanningRun>(`/planning/runs/${latest.id}`);
    const plans = detail.plans ?? [];
    const optimized = plans.find((plan) => plan.planType === 'OPTIMIZED');
    const baseline = plans.find((plan) => plan.planType === 'BASELINE');

    if (optimized) {
      await this.loadPlan(optimized.id);
    }

    if (optimized && baseline) {
      await this.loadComparison(optimized.id, baseline.id);
    }
  }

  clearError(): void {
    this._error.set(null);
  }

  private messageOf(error: unknown): string {
    if (error instanceof ApiError) return error.message;
    if (error instanceof Error) return error.message;
    return 'Unexpected error';
  }
}
