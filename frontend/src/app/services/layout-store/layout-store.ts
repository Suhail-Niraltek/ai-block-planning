import { computed, Service, signal } from '@angular/core';

/**
 * Shell state shared between the topbar and the sidebar.
 *
 * The sidebar is a permanent rail on desktop and a slide-over drawer on tablet
 * and mobile, so both components need to agree on whether it is open.
 */
@Service()
export class LayoutStore {
  private readonly _navOpen = signal(false);

  readonly navOpen = this._navOpen.asReadonly();

  readonly navButtonLabel = computed(() => (this._navOpen() ? 'Close navigation' : 'Open navigation'));

  openNav(): void {
    this._navOpen.set(true);
  }

  closeNav(): void {
    this._navOpen.set(false);
  }

  toggleNav(): void {
    this._navOpen.update((open) => !open);
  }
}
