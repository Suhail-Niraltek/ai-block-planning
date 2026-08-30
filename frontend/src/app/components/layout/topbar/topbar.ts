import { Component, computed, inject, OnInit } from '@angular/core';
import { Icon } from '../../shared/icon/icon';
import { LayoutStore } from '../../../services/layout-store/layout-store';
import { SourceStore } from '../../../services/source-store/source-store';
import { ThemeService } from '../../../services/theme-service/theme-service';

@Component({
  imports: [Icon],
  selector: 'app-topbar',
  styleUrl: './topbar.scss',
  templateUrl: './topbar.html',
})
export class Topbar implements OnInit {
  protected readonly theme = inject(ThemeService);
  protected readonly sources = inject(SourceStore);
  protected readonly layout = inject(LayoutStore);

  /** One pill instead of two: the connection is only healthy if both parts are. */
  protected readonly connection = computed(() => {
    const health = this.sources.health();

    if (!health) {
      return {
        label: 'Backend unreachable',
        detail: 'Start the API with "npm run dev" in the backend folder',
        icon: 'circle-x' as const,
        classes:
          'bg-red-50 text-red-800 ring-red-200 dark:bg-red-950/60 dark:text-red-200 dark:ring-red-900',
      };
    }

    if (health.database !== 'connected') {
      return {
        label: 'Database offline',
        detail: health.databaseError ?? 'MySQL is not reachable',
        icon: 'triangle-alert' as const,
        classes:
          'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-100 dark:ring-amber-900',
      };
    }

    return {
      label: 'Connected',
      detail: 'API and MySQL are both responding',
      icon: 'circle-check' as const,
      classes:
        'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:ring-emerald-900',
    };
  });

  ngOnInit(): void {
    void this.sources.loadHealth();
  }
}
