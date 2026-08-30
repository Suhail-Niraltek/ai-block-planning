import { Component, input } from '@angular/core';
import { IconName } from '../icon/lucide-paths';
import { Icon } from '../icon/icon';

/**
 * Consistent page heading: an icon, a title, one sentence of orientation, and a
 * slot for the page's primary action.
 */
@Component({
  imports: [Icon],
  selector: 'app-page-header',
  styleUrl: './page-header.scss',
  templateUrl: './page-header.html',
})
export class PageHeader {
  readonly icon = input.required<IconName>();
  readonly title = input.required<string>();
  readonly description = input<string>('');
  readonly step = input<number | null>(null);
}
