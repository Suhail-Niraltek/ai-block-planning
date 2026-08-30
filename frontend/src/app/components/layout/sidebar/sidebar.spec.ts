import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Api } from '../../../core/api/api';
import { LayoutStore } from '../../../services/layout-store/layout-store';
import { SourceStore } from '../../../services/source-store/source-store';
import { Sidebar } from './sidebar';

class FakeApi {
  sources: unknown[] = [];

  async get<T>(path: string): Promise<T> {
    if (path === '/sources') return this.sources as T;
    return [] as T;
  }

  async post<T>(): Promise<T> {
    return [] as T;
  }
}

describe('Sidebar', () => {
  let component: Sidebar;
  let fixture: ComponentFixture<Sidebar>;
  let api: FakeApi;

  beforeEach(async () => {
    api = new FakeApi();

    await TestBed.configureTestingModule({
      imports: [Sidebar],
      // Clicking a link navigates, so the destinations must actually resolve.
      providers: [
        provideRouter([
          { path: 'dashboard', children: [] },
          { path: 'data-sources', children: [] },
          { path: 'maintenance', children: [] },
          { path: 'planner', children: [] },
          { path: 'compare', children: [] },
        ]),
        { provide: Api, useValue: api },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Sidebar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('links to every screen in the workflow', () => {
    const hrefs = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).map(
      (anchor) => anchor.getAttribute('href'),
    );

    expect(hrefs).toContain('/dashboard');
    expect(hrefs).toContain('/data-sources');
    expect(hrefs).toContain('/maintenance');
    expect(hrefs).toContain('/planner');
    expect(hrefs).toContain('/compare');
  });

  it('numbers the guided steps so the order is obvious', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Workflow');
    expect(text).toContain('Data sources');
    expect(text).toContain('Block planner');
  });

  it('states the decision-support limitation', () => {
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Decision support only');
  });

  it('labels the navigation landmark', () => {
    const nav = (fixture.nativeElement as HTMLElement).querySelector('nav');

    expect(nav?.getAttribute('aria-label')).toBe('Primary navigation');
  });

  it('marks no step complete before anything has been loaded', () => {
    expect(component['completedSteps']().size).toBe(0);
  });

  it('ticks the data-source step once a source reports as loaded', async () => {
    api.sources = [
      {
        id: 'id-TMS',
        code: 'TMS',
        name: 'TMS',
        adapterType: 'MOCK',
        lastSyncAt: '2026-08-30 10:00:00.000',
        lastSyncStatus: 'COMPLETED',
        recordCount: 40,
        department: 'ENG',
        kind: 'MAINTENANCE',
        synthetic: true,
      },
    ];

    await TestBed.inject(SourceStore).load();
    await fixture.whenStable();

    expect(component['completedSteps']().has(1)).toBe(true);
  });

  it('slides out of view while the drawer is closed', () => {
    const nav = (fixture.nativeElement as HTMLElement).querySelector('nav');

    expect(nav?.className).toContain('-translate-x-full');
  });

  it('slides into view when the drawer is opened, and renders a scrim to close it', async () => {
    const layout = TestBed.inject(LayoutStore);

    layout.openNav();
    await fixture.whenStable();

    const nav = (fixture.nativeElement as HTMLElement).querySelector('nav');

    expect(nav?.className).toContain('translate-x-0');
    expect(nav?.className).not.toContain('-translate-x-full');

    const scrim = (fixture.nativeElement as HTMLElement).querySelector('[aria-hidden="true"]');
    expect(scrim).not.toBeNull();
  });

  it('closes the drawer when a destination is chosen', async () => {
    const layout = TestBed.inject(LayoutStore);

    layout.openNav();
    await fixture.whenStable();

    const link = (fixture.nativeElement as HTMLElement).querySelector('a') as HTMLAnchorElement;
    link.click();
    await fixture.whenStable();

    expect(layout.navOpen()).toBe(false);
  });
});
