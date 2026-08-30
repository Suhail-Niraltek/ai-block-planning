import { Component, computed, input } from '@angular/core';
import { IconName } from '../icon/lucide-paths';
import { Icon } from '../icon/icon';

export type BadgeTone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral:
    'bg-slate-100 text-slate-700 ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600',
  good: 'bg-emerald-50 text-emerald-800 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800',
  warn: 'bg-amber-50 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800',
  bad: 'bg-red-50 text-red-800 ring-red-300 dark:bg-red-950 dark:text-red-200 dark:ring-red-800',
  info: 'bg-sky-50 text-sky-800 ring-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800',
};

@Component({
  imports: [Icon],
  selector: 'app-status-badge',
  styleUrl: './status-badge.scss',
  templateUrl: './status-badge.html',
})
export class StatusBadge {
  readonly label = input.required<string>();
  readonly tone = input<BadgeTone>('neutral');
  /** Optional explicit Tailwind classes, used for department and severity chips. */
  readonly classOverride = input<string | null>(null);
  readonly icon = input<IconName | null>(null);

  protected readonly classes = computed(() => this.classOverride() ?? TONE_CLASS[this.tone()]);
}
