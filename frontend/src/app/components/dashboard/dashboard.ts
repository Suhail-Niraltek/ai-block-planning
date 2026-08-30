import { Component, computed, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DEPARTMENTS, SOURCES } from '../../core/constants/department-constants';
import { MaintenanceStore } from '../../services/maintenance-store/maintenance-store';
import { PlanningStore } from '../../services/planning-store/planning-store';
import { SourceStore } from '../../services/source-store/source-store';
import { Icon } from '../shared/icon/icon';
import { LoadingState } from '../shared/loading-state/loading-state';
import { MetricCard } from '../shared/metric-card/metric-card';
import { PageHeader } from '../shared/page-header/page-header';

@Component({
  imports: [RouterLink, Icon, LoadingState, MetricCard, PageHeader],
  selector: 'app-dashboard',
  styleUrl: './dashboard.scss',
  templateUrl: './dashboard.html',
})
export class Dashboard implements OnInit {
  protected readonly sources = inject(SourceStore);
  protected readonly maintenance = inject(MaintenanceStore);
  protected readonly planning = inject(PlanningStore);

  protected readonly sourceList = SOURCES;
  protected readonly departments = DEPARTMENTS;

  protected readonly totals = computed(() => this.maintenance.summary()?.totals ?? null);
  protected readonly plan = computed(() => this.planning.plan());

  /**
   * The three states a first-time visitor can be in. The dashboard leads with
   * whichever one applies, so there is always an obvious next action.
   */
  protected readonly stage = computed<'NO_DATA' | 'NO_PLAN' | 'READY'>(() => {
    if (this.sources.syncedCount() === 0) return 'NO_DATA';
    if (!this.planning.hasPlan()) return 'NO_PLAN';
    return 'READY';
  });

  protected readonly loadingAnything = computed(
    () => this.sources.loading() || this.maintenance.loading() || this.planning.loading(),
  );

  /** Department split, ready to render as one labelled bar. */
  protected readonly departmentSplit = computed(() => {
    const totals = this.totals();

    if (!totals) return [];

    const counts: Record<string, number> = {
      ENG: Number(totals.engTasks) || 0,
      TRD: Number(totals.trdTasks) || 0,
      SNT: Number(totals.sntTasks) || 0,
    };

    const total = counts['ENG'] + counts['TRD'] + counts['SNT'];

    return DEPARTMENTS.map((department) => ({
      ...department,
      count: counts[department.code],
      percentage: total > 0 ? Math.round((counts[department.code] / total) * 100) : 0,
    }));
  });

  /** How much of the backlog this plan actually retired, as a sentence. */
  protected readonly planSummary = computed(() => {
    const plan = this.plan();

    if (!plan) return null;

    const coverage =
      plan.totalTasks > 0 ? Math.round((plan.scheduledTasks / plan.totalTasks) * 100) : 0;

    return {
      coverage,
      horizon: plan.horizonType === 'WEEKLY' ? 'week' : 'month',
      criticalCovered: plan.criticalTasksScheduled,
      criticalLeft: plan.criticalTasksUnscheduled,
    };
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.sources.loadHealth(),
      this.sources.load(),
      this.maintenance.load(),
      this.planning.loadLatestRun(),
    ]);
  }

  protected async syncAll(): Promise<void> {
    await this.sources.syncAll();
    await this.maintenance.load();
  }
}
