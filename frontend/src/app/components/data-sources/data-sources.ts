import { Component, computed, inject, OnInit } from '@angular/core';
import { SOURCES, sourceMeta } from '../../core/constants/department-constants';
import { SourceCode } from '../../core/models/source';
import { SourceStore } from '../../services/source-store/source-store';
import { Icon } from '../shared/icon/icon';
import { LoadingState } from '../shared/loading-state/loading-state';
import { PageHeader } from '../shared/page-header/page-header';
import { StatusBadge } from '../shared/status-badge/status-badge';

@Component({
  imports: [Icon, LoadingState, PageHeader, StatusBadge],
  selector: 'app-data-sources',
  styleUrl: './data-sources.scss',
  templateUrl: './data-sources.html',
})
export class DataSources implements OnInit {
  protected readonly store = inject(SourceStore);
  protected readonly sourceMeta = sourceMeta;
  protected readonly sourceList = SOURCES;

  protected readonly totalRecords = computed(() =>
    this.store.sources().reduce((total, source) => total + Number(source.recordCount ?? 0), 0),
  );

  ngOnInit(): void {
    void this.store.load();
  }

  protected sync(code: SourceCode): void {
    void this.store.sync(code);
  }

  protected syncAll(): void {
    void this.store.syncAll();
  }

  /** Formats the stored timestamp as something a person reads at a glance. */
  protected relativeTime(value: string | null): string {
    if (!value) return 'Never loaded';

    const then = Date.parse(`${value.replace(' ', 'T')}Z`);

    if (Number.isNaN(then)) return value;

    const minutes = Math.round((Date.now() - then) / 60_000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;

    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;

    return `${Math.round(hours / 24)} d ago`;
  }
}
