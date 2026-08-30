import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Api } from '../../../core/api/api';
import { LayoutStore } from '../../../services/layout-store/layout-store';
import { Topbar } from './topbar';

class FakeApi {
  health: unknown = {
    status: 'ok',
    database: 'connected',
    databaseError: null,
    dataOrigin: 'SYNTHETIC',
    notice: 'synthetic',
  };

  error: unknown = null;

  async get<T>(): Promise<T> {
    if (this.error) throw this.error;
    return this.health as T;
  }

  async post<T>(): Promise<T> {
    return undefined as T;
  }
}

async function build(api: FakeApi): Promise<ComponentFixture<Topbar>> {
  await TestBed.configureTestingModule({
    imports: [Topbar],
    providers: [{ provide: Api, useValue: api }],
  }).compileComponents();

  const fixture = TestBed.createComponent(Topbar);
  await fixture.whenStable();

  return fixture;
}

describe('Topbar', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('should create', async () => {
    const fixture = await build(new FakeApi());

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('reports a single healthy connection when the API and database both respond', async () => {
    const fixture = await build(new FakeApi());

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Connected');
  });

  it('distinguishes an unreachable backend from a database that is merely offline', async () => {
    const offline = new FakeApi();
    offline.health = {
      status: 'degraded',
      database: 'disconnected',
      databaseError: 'ECONNREFUSED',
      dataOrigin: 'SYNTHETIC',
      notice: '',
    };

    const fixture = await build(offline);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Database offline');
  });

  it('says the backend is unreachable when health cannot be read at all', async () => {
    const down = new FakeApi();
    down.error = new Error('network');

    const fixture = await build(down);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Backend unreachable');
  });

  it('exposes the theme toggle with its pressed state', async () => {
    const fixture = await build(new FakeApi());

    const toggle = (fixture.nativeElement as HTMLElement).querySelector('button[aria-pressed]');

    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-label')).toContain('mode');
  });

  it('offers a navigation button that reflects the drawer state', async () => {
    const fixture = await build(new FakeApi());
    const layout = TestBed.inject(LayoutStore);

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button[aria-expanded]',
    ) as HTMLButtonElement;

    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Open navigation');

    button.click();
    await fixture.whenStable();

    expect(layout.navOpen()).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Close navigation');
  });
});
