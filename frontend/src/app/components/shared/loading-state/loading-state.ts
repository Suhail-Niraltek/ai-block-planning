import { Component, input } from '@angular/core';
import { Icon } from '../icon/icon';

@Component({
  imports: [Icon],
  selector: 'app-loading-state',
  styleUrl: './loading-state.scss',
  templateUrl: './loading-state.html',
})
export class LoadingState {
  readonly message = input<string>('Loading');
}
