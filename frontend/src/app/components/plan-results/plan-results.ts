import { Component, computed, inject, input, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  BLOCK_TYPE_LABELS,
  REASON_ACTION,
  REASON_ICON,
  REASON_LABELS,
  SEVERITY_CLASS,
  departmentMeta,
} from '../../core/constants/department-constants';
import { PlanBlock } from '../../core/models/planning';
import { PlanningStore } from '../../services/planning-store/planning-store';
import { EmptyState } from '../shared/empty-state/empty-state';
import { Icon } from '../shared/icon/icon';
import { LoadingState } from '../shared/loading-state/loading-state';
import { MetricCard } from '../shared/metric-card/metric-card';
import { PageHeader } from '../shared/page-header/page-header';
import { StatusBadge } from '../shared/status-badge/status-badge';

/** Plain-language meaning for each solver status, so nothing is overstated. */
const SOLVER_EXPLANATION: Record<string, string> = {
  OPTIMAL:
    'The solver proved no better plan exists for these jobs, windows and safety rules.',
  FEASIBLE:
    'The solver found a valid plan but ran out of time proving it was the best one. It is safe, just not proven optimal.',
  FALLBACK_FEASIBLE:
    'The optimizer could not produce a usable result, so a simpler rule-based planner built this. It is safe, but not optimised.',
  INFEASIBLE: 'No plan can satisfy the constraints for this horizon.',
  FAILED: 'The solver failed, so no plan was produced.',
};

@Component({
  imports: [RouterLink, EmptyState, Icon, LoadingState, MetricCard, PageHeader, StatusBadge],
  selector: 'app-plan-results',
  styleUrl: './plan-results.scss',
  templateUrl: './plan-results.html',
})
export class PlanResults implements OnInit {
  /** Bound from the :id route parameter via withComponentInputBinding(). */
  readonly id = input<string>('');

  protected readonly store = inject(PlanningStore);

  protected readonly departmentMeta = departmentMeta;
  protected readonly severityClass = SEVERITY_CLASS;
  protected readonly reasonLabels = REASON_LABELS;
  protected readonly reasonAction = REASON_ACTION;
  protected readonly reasonIcon = REASON_ICON;
  protected readonly blockTypeLabels = BLOCK_TYPE_LABELS;

  protected readonly solverExplanation = computed(
    () => SOLVER_EXPLANATION[this.store.plan()?.solverStatus ?? ''] ?? '',
  );

  protected readonly solverTone = computed(() => {
    switch (this.store.plan()?.solverStatus) {
      case 'OPTIMAL':
        return 'good' as const;
      case 'FEASIBLE':
      case 'FALLBACK_FEASIBLE':
        return 'warn' as const;
      default:
        return 'bad' as const;
    }
  });

  /** Every scheduled task, flattened, for the accessible table below the timeline. */
  protected readonly scheduledRows = computed(() =>
    this.store.blocks().flatMap((block) => block.tasks.map((task) => ({ block, task }))),
  );

  protected readonly coverage = computed(() => {
    const plan = this.store.plan();

    if (!plan || plan.totalTasks === 0) return 0;

    return Math.round((plan.scheduledTasks / plan.totalTasks) * 100);
  });

  ngOnInit(): void {
    const planId = this.id();

    if (planId) {
      void this.store.loadPlan(planId);
    } else {
      void this.store.loadLatestRun();
    }
  }

  /** Position of a task bar inside its block, as a percentage. */
  protected barStyle(block: PlanBlock, plannedStart: string, plannedEnd: string): string {
    const blockStart = Date.parse(`${block.startsAt.replace(' ', 'T')}Z`);
    const blockEnd = Date.parse(`${block.endsAt.replace(' ', 'T')}Z`);
    const span = blockEnd - blockStart;

    if (!Number.isFinite(span) || span <= 0) {
      return 'left:0%;width:100%';
    }

    const start = Date.parse(`${plannedStart.replace(' ', 'T')}Z`);
    const end = Date.parse(`${plannedEnd.replace(' ', 'T')}Z`);

    const left = Math.max(0, ((start - blockStart) / span) * 100);
    const width = Math.max(2, Math.min(100 - left, ((end - start) / span) * 100));

    return `left:${left}%;width:${width}%`;
  }

  protected durationMinutes(startsAt: string, endsAt: string): number {
    const start = Date.parse(`${startsAt.replace(' ', 'T')}Z`);
    const end = Date.parse(`${endsAt.replace(' ', 'T')}Z`);

    return Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / 60_000) : 0;
  }

  /** `2026-08-30 19:00:00.000` reads better as `Sun 30 Aug, 19:00`. */
  protected shortDateTime(value: string): string {
    const parsed = new Date(`${value.replace(' ', 'T')}Z`);

    if (Number.isNaN(parsed.getTime())) return value;

    return parsed.toLocaleString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    });
  }

  protected shortTime(value: string): string {
    const parsed = new Date(`${value.replace(' ', 'T')}Z`);

    if (Number.isNaN(parsed.getTime())) return value;

    return parsed.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    });
  }
}
