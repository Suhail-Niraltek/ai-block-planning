import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { Api } from './core/api/api';

class FakeApi {
  async get<T>(): Promise<T> {
    return {
      status: 'ok',
      database: 'connected',
      databaseError: null,
      dataOrigin: 'SYNTHETIC',
      notice: 'synthetic',
    } as T;
  }

  async post<T>(): Promise<T> {
    return undefined as T;
  }
}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: Api, useValue: new FakeApi() }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the shell with sidebar, topbar and a routed outlet', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('app-sidebar')).not.toBeNull();
    expect(element.querySelector('app-topbar')).not.toBeNull();
    expect(element.querySelector('main')).not.toBeNull();
  });

  it('always states that the data is synthetic and the system is decision support only', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Synthetic demonstration data');
    expect(text).toContain('Decision support only');
  });
});
