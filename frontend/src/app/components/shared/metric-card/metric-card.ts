import { Component, input } from '@angular/core';
import { IconName } from '../icon/lucide-paths';
import { Icon } from '../icon/icon';

export type MetricTone = 'neutral' | 'good' | 'warn' | 'bad';

const TONE_VALUE: Record<MetricTone, string> = {
  neutral: 'text-rail-navy dark:text-slate-50',
  good: 'text-emerald-700 dark:text-emerald-400',
  warn: 'text-amber-700 dark:text-amber-400',
  bad: 'text-rail-red dark:text-red-400',
};

const TONE_ICON: Record<MetricTone, string> = {
  neutral: 'icon-frame bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  good: 'icon-frame bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
  warn: 'icon-frame bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
  bad: 'icon-frame bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400',
};

@Component({
  imports: [Icon],
  selector: 'app-metric-card',
  styleUrl: './metric-card.scss',
  templateUrl: './metric-card.html',
})
export class MetricCard {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly hint = input<string | null>(null);
  readonly icon = input<IconName | null>(null);
  readonly tone = input<MetricTone>('neutral');

  protected valueClass(tone: MetricTone): string {
    return TONE_VALUE[tone];
  }

  protected iconClass(tone: MetricTone): string {
    return TONE_ICON[tone];
  }
}
