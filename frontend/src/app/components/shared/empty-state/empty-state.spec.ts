import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  let component: EmptyState;
  let fixture: ComponentFixture<EmptyState>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmptyState],
    }).compileComponents();

    fixture = TestBed.createComponent(EmptyState);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('title', 'No plan generated yet');
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the title', () => {
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No plan generated yet');
  });

  it('renders the message only when one is supplied', async () => {
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('p').length).toBe(1);

    fixture.componentRef.setInput('message', 'Generate a weekly or monthly plan.');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelectorAll('p').length).toBe(2);
  });
});
