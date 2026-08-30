import { Component, computed, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ComparisonRow } from '../../core/models/planning';
import { PlanningStore } from '../../services/planning-store/planning-store';
import { EmptyState } from '../shared/empty-state/empty-state';
import { Icon } from '../shared/icon/icon';
import { IconName } from '../shared/icon/lucide-paths';
import { LoadingState } from '../shared/loading-state/loading-state';
import { PageHeader } from '../shared/page-header/page-header';
import { StatusBadge } from '../shared/status-badge/status-badge';

/** The three measures that answer "so what?" for a non-specialist. */
const HEADLINE_KEYS = ['totalBlockMinutes', 'multiDepartmentBlockCount', 'criticalTasksScheduled'];

@Component({
  imports: [RouterLink, EmptyState, Icon, LoadingState, PageHeader, StatusBadge],
  selector: 'app-plan-comparison',
  styleUrl: './plan-comparison.scss',
  templateUrl: './plan-comparison.html',
})
export class PlanComparison implements OnInit {
  protected readonly store = inject(PlanningStore);

  protected readonly rows = computed(() => this.store.comparison()?.comparison ?? []);

  protected readonly improvedCount = computed(
    () => this.rows().filter((row) => row.improved === true).length,
  );

  protected readonly regressedCount = computed(
    () => this.rows().filter((row) => row.improved === false).length,
  );

  /** Lead with the few numbers that carry the argument, in a fixed order. */
  protected readonly headline = computed(() =>
    HEADLINE_KEYS.map((key) => this.rows().find((row) => row.key === key)).filter(
      (row): row is ComparisonRow => row !== undefined && row.delta !== 0,
    ),
  );

  ngOnInit(): void {
    if (!this.store.comparison()) {
      void this.store.loadLatestRun();
    }
  }

  /**
   * Deltas keep the sign the metric actually moved by. Whether that is good is
   * carried separately, so a fall in block minutes and a fall in critical
   * coverage never look alike.
   */
  protected formatDelta(row: ComparisonRow): string {
    if (row.delta === 0) return 'no change';
    return `${row.delta > 0 ? '+' : ''}${row.delta}`;
  }

  protected deltaClass(row: ComparisonRow): string {
    if (row.improved === null) return 'text-slate-500 dark:text-slate-400';
    return row.improved
      ? 'text-emerald-700 dark:text-emerald-400'
      : 'text-rail-red dark:text-red-400';
  }

  protected headlineIcon(key: string): IconName {
    switch (key) {
      case 'totalBlockMinutes':
        return 'timer';
      case 'multiDepartmentBlockCount':
        return 'scale';
      case 'criticalTasksScheduled':
        return 'triangle-alert';
      default:
        return 'chart-column-big';
    }
  }
}
