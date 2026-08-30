import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconName } from '../../shared/icon/lucide-paths';
import { Icon } from '../../shared/icon/icon';
import { LayoutStore } from '../../../services/layout-store/layout-store';
import { MaintenanceStore } from '../../../services/maintenance-store/maintenance-store';
import { PlanningStore } from '../../../services/planning-store/planning-store';
import { SourceStore } from '../../../services/source-store/source-store';

interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly description: string;
  readonly icon: IconName;
  /** Position in the guided workflow, or null for a page outside it. */
  readonly step: number | null;
}

@Component({
  imports: [RouterLink, RouterLinkActive, Icon],
  selector: 'app-sidebar',
  styleUrl: './sidebar.scss',
  templateUrl: './sidebar.html',
})
export class Sidebar {
  protected readonly layout = inject(LayoutStore);
  private readonly sources = inject(SourceStore);
  private readonly maintenance = inject(MaintenanceStore);
  private readonly planning = inject(PlanningStore);

  protected readonly items: readonly NavItem[] = [
    {
      path: '/dashboard',
      label: 'Overview',
      description: 'Where everything stands',
      icon: 'gauge',
      step: null,
    },
    {
      path: '/data-sources',
      label: 'Data sources',
      description: 'TMS, SMMS, TDMS, COA, timetable, forecast',
      icon: 'plug-zap',
      step: 1,
    },
    {
      path: '/maintenance',
      label: 'Maintenance backlog',
      description: 'Unified, prioritised task list',
      icon: 'list-checks',
      step: 2,
    },
    {
      path: '/planner',
      label: 'Block planner',
      description: 'Generate a weekly or monthly plan',
      icon: 'calendar-cog',
      step: 3,
    },
    {
      path: '/compare',
      label: 'Impact vs manual',
      description: 'Optimized against the baseline',
      icon: 'scale',
      step: 4,
    },
  ];

  /**
   * A tick beside a step tells the user that stage is done, so the sidebar
   * doubles as progress through the workflow.
   */
  protected readonly completedSteps = computed<ReadonlySet<number>>(() => {
    const done = new Set<number>();

    if (this.sources.syncedCount() > 0) done.add(1);
    if (this.maintenance.tasks().length > 0) done.add(2);
    if (this.planning.hasPlan()) done.add(3);
    if (this.planning.comparison() !== null) done.add(4);

    return done;
  });

  protected close(): void {
    this.layout.closeNav();
  }
}
