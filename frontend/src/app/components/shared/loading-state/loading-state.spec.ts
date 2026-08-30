import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LoadingState } from './loading-state';

describe('LoadingState', () => {
  let component: LoadingState;
  let fixture: ComponentFixture<LoadingState>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoadingState],
    }).compileComponents();

    fixture = TestBed.createComponent(LoadingState);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('defaults to a generic message', () => {
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Loading');
  });

  it('announces itself to assistive technology', () => {
    const status = (fixture.nativeElement as HTMLElement).querySelector('[role="status"]');

    expect(status).not.toBeNull();
    expect(status?.getAttribute('aria-live')).toBe('polite');
  });

  it('shows a custom stage message', async () => {
    fixture.componentRef.setInput('message', 'Running the optimizer');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Running the optimizer');
  });
});
