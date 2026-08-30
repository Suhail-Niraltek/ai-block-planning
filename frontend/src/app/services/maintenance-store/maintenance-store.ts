import { computed, inject, Service, signal } from '@angular/core';
import { Api, ApiError } from '../../core/api/api';
import {
  MaintenanceSummary,
  MaintenanceTask,
  RecalculateResult,
  Severity,
  TaskFilters,
} from '../../core/models/maintenance';
import { Corridor, Section } from '../../core/models/operations';
import { Department } from '../../core/models/source';

const EMPTY_FILTERS: TaskFilters = {
  department: null,
  severity: null,
  sectionId: null,
  status: null,
  overdueOnly: false,
  minPriority: 0,
};

@Service()
export class MaintenanceStore {
  private readonly api = inject(Api);

  private readonly _tasks = signal<readonly MaintenanceTask[]>([]);
  private readonly _summary = signal<MaintenanceSummary | null>(null);
  private readonly _sections = signal<readonly Section[]>([]);
  private readonly _corridors = signal<readonly Corridor[]>([]);
  private readonly _filters = signal<TaskFilters>(EMPTY_FILTERS);
  private readonly _selectedTaskId = signal<string | null>(null);
  private readonly _loading = signal(false);
  private readonly _recalculating = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _lastRecalculation = signal<RecalculateResult | null>(null);

  readonly tasks = this._tasks.asReadonly();
  readonly summary = this._summary.asReadonly();
  readonly sections = this._sections.asReadonly();
  readonly corridors = this._corridors.asReadonly();
  readonly filters = this._filters.asReadonly();
  readonly selectedTaskId = this._selectedTaskId.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly recalculating = this._recalculating.asReadonly();
  readonly error = this._error.asReadonly();
  readonly lastRecalculation = this._lastRecalculation.asReadonly();

  /**
   * Filtering happens client-side over the loaded page so the table responds
   * instantly; the same filters are also sent to the API on reload.
   */
  readonly filteredTasks = computed(() => {
    const filters = this._filters();

    return this._tasks().filter((task) => {
      if (filters.department && task.department !== filters.department) return false;
      if (filters.severity && task.severity !== filters.severity) return false;
      if (filters.sectionId && task.sectionId !== filters.sectionId) return false;
      if (filters.status && task.status !== filters.status) return false;
      if (filters.overdueOnly && task.daysOverdue <= 0) return false;
      if (task.priorityScore < filters.minPriority) return false;

      return true;
    });
  });

  readonly filteredCount = computed(() => this.filteredTasks().length);

  readonly criticalCount = computed(
    () => this.filteredTasks().filter((task) => task.severity === 'CRITICAL').length,
  );

  readonly overdueCount = computed(
    () => this.filteredTasks().filter((task) => task.daysOverdue > 0).length,
  );

  readonly mlScoredCount = computed(
    () => this.filteredTasks().filter((task) => task.prioritySource === 'ML').length,
  );

  readonly departmentCounts = computed(() => {
    const counts: Record<Department, number> = { ENG: 0, TRD: 0, SNT: 0 };

    for (const task of this.filteredTasks()) {
      counts[task.department] += 1;
    }

    return counts;
  });

  readonly selectedTask = computed(
    () => this._tasks().find((task) => task.id === this._selectedTaskId()) ?? null,
  );

  readonly hasActiveFilters = computed(() => {
    const filters = this._filters();

    return (
      filters.department !== null ||
      filters.severity !== null ||
      filters.sectionId !== null ||
      filters.status !== null ||
      filters.overdueOnly ||
      filters.minPriority > 0
    );
  });

  setDepartment(department: Department | null): void {
    this._filters.update((current) => ({ ...current, department }));
  }

  setSeverity(severity: Severity | null): void {
    this._filters.update((current) => ({ ...current, severity }));
  }

  setSection(sectionId: string | null): void {
    this._filters.update((current) => ({ ...current, sectionId }));
  }

  setOverdueOnly(overdueOnly: boolean): void {
    this._filters.update((current) => ({ ...current, overdueOnly }));
  }

  setMinPriority(minPriority: number): void {
    this._filters.update((current) => ({ ...current, minPriority }));
  }

  clearFilters(): void {
    this._filters.set(EMPTY_FILTERS);
  }

  selectTask(id: string | null): void {
    this._selectedTaskId.set(id);
  }

  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);

    try {
      const [tasks, summary, corridors, sections] = await Promise.all([
        this.api.get<readonly MaintenanceTask[]>('/maintenance/tasks', { limit: 2000 }),
        this.api.get<MaintenanceSummary>('/maintenance/summary'),
        this.api.get<readonly Corridor[]>('/corridors'),
        this.api.get<readonly Section[]>('/sections'),
      ]);

      this._tasks.set(tasks);
      this._summary.set(summary);
      this._corridors.set(corridors);
      this._sections.set(sections);
    } catch (error) {
      this._error.set(this.messageOf(error));
    } finally {
      this._loading.set(false);
    }
  }

  async recalculate(): Promise<void> {
    this._recalculating.set(true);
    this._error.set(null);

    try {
      this._lastRecalculation.set(
        await this.api.post<RecalculateResult>('/maintenance/recalculate-priorities', {
          retrain: true,
        }),
      );

      await this.load();
    } catch (error) {
      this._error.set(this.messageOf(error));
    } finally {
      this._recalculating.set(false);
    }
  }

  private messageOf(error: unknown): string {
    if (error instanceof ApiError) return error.message;
    if (error instanceof Error) return error.message;
    return 'Unexpected error';
  }
}
