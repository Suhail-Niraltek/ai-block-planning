import { TestBed } from '@angular/core/testing';
import { LayoutStore } from './layout-store';

describe('LayoutStore', () => {
  let service: LayoutStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LayoutStore);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('starts with the drawer closed', () => {
    expect(service.navOpen()).toBe(false);
    expect(service.navButtonLabel()).toBe('Open navigation');
  });

  it('opens, closes and toggles the drawer', () => {
    service.openNav();
    expect(service.navOpen()).toBe(true);
    expect(service.navButtonLabel()).toBe('Close navigation');

    service.closeNav();
    expect(service.navOpen()).toBe(false);

    service.toggleNav();
    expect(service.navOpen()).toBe(true);

    service.toggleNav();
    expect(service.navOpen()).toBe(false);
  });
});
