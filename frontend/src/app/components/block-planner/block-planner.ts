import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormField, form, required, schema } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { HorizonType, PlanningRequest } from '../../core/models/planning';
import { MaintenanceStore } from '../../services/maintenance-store/maintenance-store';
import { PlanningStore } from '../../services/planning-store/planning-store';
import { Icon } from '../shared/icon/icon';
import { IconName } from '../shared/icon/lucide-paths';
import { PageHeader } from '../shared/page-header/page-header';
import { StatusBadge } from '../shared/status-badge/status-badge';

interface PlannerModel {
  horizonType: HorizonType;
  horizonStart: string;
}

/** Today in UTC as `yyyy-mm-dd`, the value the date input expects. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const plannerSchema = schema<PlannerModel>((path) => {
  required(path.horizonStart, { message: 'Choose the first day of the planning horizon' });
  required(path.horizonType, { message: 'Choose a weekly or monthly horizon' });
});

@Component({
  imports: [FormField, Icon, PageHeader, StatusBadge],
  selector: 'app-block-planner',
  styleUrl: './block-planner.scss',
  templateUrl: './block-planner.html',
})
export class BlockPlanner implements OnInit {
  private readonly router = inject(Router);
  protected readonly planning = inject(PlanningStore);
  protected readonly maintenance = inject(MaintenanceStore);

  private readonly model = signal<PlannerModel>({
    horizonType: 'WEEKLY',
    horizonStart: todayIso(),
  });

  protected readonly plannerForm = form(this.model, plannerSchema);

  protected readonly horizonOptions: readonly {
    value: HorizonType;
    label: string;
    detail: string;
    icon: IconName;
  }[] = [
    {
      value: 'WEEKLY',
      label: 'This week',
      detail: 'Seven days, exact start and end times',
      icon: 'calendar-days',
    },
    {
      value: 'MONTHLY',
      label: 'This month',
      detail: 'A full month, for longer-range planning',
      icon: 'calendar-cog',
    },
  ];

  /** Mirrors the pipeline the backend actually runs, so the wait is legible. */
  protected readonly stages: readonly { label: string; detail: string }[] = [
    {
      label: 'Loading maintenance, corridor and train data',
      detail: 'Open jobs, published windows, protected paths and the freight forecast.',
    },
    {
      label: 'Working out usable time',
      detail: 'Protected trains plus their safety buffer are cut out of every window.',
    },
    {
      label: 'Optimising',
      detail: 'Chooses which jobs go where, bundling compatible departments into one block.',
    },
    {
      label: 'Safety re-check',
      detail: 'An independent pass re-derives every rule; an unsafe plan is thrown away.',
    },
    {
      label: 'Building the manual baseline',
      detail: 'The same jobs planned department-by-department, for comparison.',
    },
  ];

  private readonly _selectedCorridorIds = signal<ReadonlySet<string>>(new Set());
  protected readonly selectedCorridorIds = this._selectedCorridorIds.asReadonly();

  protected readonly horizonDescription = computed(() => {
    const { horizonType, horizonStart } = this.model();

    if (!horizonStart) {
      return 'Choose a start date to see the horizon.';
    }

    const start = new Date(`${horizonStart}T00:00:00Z`);

    if (Number.isNaN(start.getTime())) {
      return 'Choose a valid start date.';
    }

    const end =
      horizonType === 'WEEKLY'
        ? new Date(start.getTime() + 7 * 86_400_000)
        : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate()));

    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);

    return `${horizonStart} to ${end.toISOString().slice(0, 10)} (${days} days, ${
      horizonType === 'WEEKLY' ? '15-minute' : '30-minute'
    } planning granularity)`;
  });

  protected readonly canSubmit = computed(
    () => this.plannerForm().valid() && !this.planning.generating(),
  );

  ngOnInit(): void {
    void this.maintenance.load();
    void this.planning.loadRuns();
  }

  protected setHorizonType(value: HorizonType): void {
    this.plannerForm.horizonType().value.set(value);
  }

  protected toggleCorridor(corridorId: string, checked: boolean): void {
    this._selectedCorridorIds.update((current) => {
      const next = new Set(current);

      if (checked) next.add(corridorId);
      else next.delete(corridorId);

      return next;
    });
  }

  protected async generate(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }

    const { horizonType, horizonStart } = this.model();
    const corridorIds = [...this._selectedCorridorIds()];

    const request: PlanningRequest = {
      horizonType,
      // The date input gives a local calendar day; the API works in UTC instants.
      horizonStart: `${horizonStart}T00:00:00.000Z`,
      ...(corridorIds.length > 0 ? { corridorIds } : {}),
    };

    const result = await this.planning.generate(request);

    if (result) {
      await this.router.navigate(['/plans', result.optimizedPlanId]);
    }
  }
}
