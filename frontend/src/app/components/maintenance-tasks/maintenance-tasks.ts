import { Component, computed, inject, linkedSignal, OnInit, signal } from '@angular/core';
import {
  DEPARTMENTS,
  SEVERITIES,
  SEVERITY_CLASS,
  departmentMeta,
} from '../../core/constants/department-constants';
import { MaintenanceTask, Severity } from '../../core/models/maintenance';
import { Department } from '../../core/models/source';
import { MaintenanceStore } from '../../services/maintenance-store/maintenance-store';
import { EmptyState } from '../shared/empty-state/empty-state';
import { Icon } from '../shared/icon/icon';
import { IconName } from '../shared/icon/lucide-paths';
import { LoadingState } from '../shared/loading-state/loading-state';
import { PageHeader } from '../shared/page-header/page-header';
import { StatusBadge } from '../shared/status-badge/status-badge';

@Component({
  imports: [EmptyState, Icon, LoadingState, PageHeader, StatusBadge],
  selector: 'app-maintenance-tasks',
  styleUrl: './maintenance-tasks.scss',
  templateUrl: './maintenance-tasks.html',
})
export class MaintenanceTasks implements OnInit {
  protected readonly store = inject(MaintenanceStore);

  private readonly _expandedTaskIds = signal<ReadonlySet<string>>(new Set());
  protected readonly expandedTaskIds = this._expandedTaskIds.asReadonly();

  protected readonly departments = DEPARTMENTS;
  protected readonly severities = SEVERITIES;
  protected readonly severityClass = SEVERITY_CLASS;
  protected readonly departmentMeta = departmentMeta;

  /**
   * The section list depends on which corridor is chosen, so the selection has
   * to reset when the corridor changes rather than pointing at a stale section.
   */
  protected readonly corridorId = linkedSignal<readonly unknown[], string | null>({
    source: () => this.store.corridors(),
    computation: () => null,
  });

  protected readonly sectionsForCorridor = computed(() => {
    const corridor = this.corridorId();
    const sections = this.store.sections();

    return corridor ? sections.filter((section) => section.corridorId === corridor) : sections;
  });

  /** The top of the list is what a planner acts on first. */
  protected readonly mostUrgent = computed(() => this.store.filteredTasks().slice(0, 3));

  ngOnInit(): void {
    void this.store.load();
  }

  protected onCorridorChange(value: string): void {
    this.corridorId.set(value || null);
    // The previously chosen section may not belong to the new corridor.
    this.store.setSection(null);
  }

  protected onDepartmentChange(value: string): void {
    this.store.setDepartment((value || null) as Department | null);
  }

  protected onSeverityChange(value: string): void {
    this.store.setSeverity((value || null) as Severity | null);
  }

  protected onSectionChange(value: string): void {
    this.store.setSection(value || null);
  }

  protected onOverdueChange(event: Event): void {
    this.store.setOverdueOnly((event.target as HTMLInputElement).checked);
  }

  protected onMinPriorityChange(event: Event): void {
    this.store.setMinPriority(Number((event.target as HTMLInputElement).value));
  }

  protected toggleDetail(task: MaintenanceTask): void {
    this._expandedTaskIds.update((current) => {
      const next = new Set(current);

      if (next.has(task.id)) next.delete(task.id);
      else next.add(task.id);

      return next;
    });
  }

  protected isExpanded(taskId: string): boolean {
    return this._expandedTaskIds().has(taskId);
  }

  protected collapseAllDetails(): void {
    this._expandedTaskIds.set(new Set());
  }

  protected recalculate(): void {
    void this.store.recalculate();
  }

  /** Which kind of possession this job needs, as short labels. */
  protected blockRequirements(task: MaintenanceTask): readonly string[] {
    const parts: string[] = [];

    if (task.requiresLineBlock) parts.push('Line');
    if (task.requiresPowerBlock) parts.push('Power');
    if (task.requiresDisconnection) parts.push('Disconnect');

    return parts;
  }

  /** A 0-100 score means little on its own, so it is banded in words too. */
  protected priorityBand(score: number): { label: string; tone: 'bad' | 'warn' | 'neutral' } {
    if (score >= 70) return { label: 'Urgent', tone: 'bad' };
    if (score >= 45) return { label: 'Elevated', tone: 'warn' };
    return { label: 'Routine', tone: 'neutral' };
  }

  /** Turns ROC-AUC into the plain sentence it actually means. */
  protected rankingAccuracy(rocAuc: number | null): string {
    return rocAuc === null ? 'an unknown share' : `${Math.round(rocAuc * 100)}%`;
  }

  protected dueLabel(task: MaintenanceTask): string {
    if (task.daysOverdue > 0) {
      return `${task.daysOverdue} day${task.daysOverdue === 1 ? '' : 's'} overdue`;
    }

    const due = Date.parse(`${task.dueAt.replace(' ', 'T')}Z`);

    if (Number.isNaN(due)) return task.dueAt;

    const days = Math.ceil((due - Date.now()) / 86_400_000);

    if (days <= 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';

    return `Due in ${days} days`;
  }

  /** Gives each score factor a visual cue without depending on colour alone. */
  protected scoreFactorIcon(factor: string, detail: string): IconName {
    const text = `${factor} ${detail}`.toLowerCase();

    if (text.includes('safety') || text.includes('severity')) return 'triangle-alert';
    if (text.includes('overdue') || text.includes('past due')) return 'timer';
    if (text.includes('speed') || text.includes('restriction')) return 'gauge';
    if (text.includes('corridor')) return 'route';
    if (text.includes('asset')) return 'wrench';
    if (text.includes('repeat') || text.includes('defect')) return 'refresh-cw';
    if (text.includes('model') || text.includes('logistic') || text.includes('rule')) {
      return 'sparkles';
    }

    return 'activity';
  }

  protected scoreFactorTone(factor: string, detail: string): string {
    const icon = this.scoreFactorIcon(factor, detail);

    switch (icon) {
      case 'triangle-alert':
        return 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400';
      case 'timer':
        return 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400';
      case 'route':
      case 'gauge':
        return 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400';
      case 'wrench':
        return 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400';
      case 'refresh-cw':
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400';
      default:
        return 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400';
    }
  }
}
