import { Component, input } from '@angular/core';
import { IconName } from '../icon/lucide-paths';
import { Icon } from '../icon/icon';

@Component({
  imports: [Icon],
  selector: 'app-empty-state',
  styleUrl: './empty-state.scss',
  templateUrl: './empty-state.html',
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly message = input<string>('');
  readonly icon = input<IconName>('info');
}
