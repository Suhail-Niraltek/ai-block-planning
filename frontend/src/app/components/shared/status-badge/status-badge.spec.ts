import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  let component: StatusBadge;
  let fixture: ComponentFixture<StatusBadge>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatusBadge],
    }).compileComponents();

    fixture = TestBed.createComponent(StatusBadge);
    component = fixture.componentInstance;
    // `label` is a required input, so it must be set before the first render.
    fixture.componentRef.setInput('label', 'COMPLETED');
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the label as text, not colour alone', () => {
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent?.trim()).toBe('COMPLETED');
  });

  it('applies the tone classes for the chosen tone', async () => {
    fixture.componentRef.setInput('tone', 'bad');
    await fixture.whenStable();

    const span = (fixture.nativeElement as HTMLElement).querySelector('span');
    expect(span?.className).toContain('bg-red-50');
  });

  it('prefers an explicit class override over the tone', async () => {
    fixture.componentRef.setInput('tone', 'bad');
    fixture.componentRef.setInput('classOverride', 'bg-blue-100 text-blue-900');
    await fixture.whenStable();

    const span = (fixture.nativeElement as HTMLElement).querySelector('span');
    expect(span?.className).toContain('bg-blue-100');
    expect(span?.className).not.toContain('bg-red-50');
  });

  it('renders an icon only when one is named', async () => {
    expect((fixture.nativeElement as HTMLElement).querySelector('svg')).toBeNull();

    fixture.componentRef.setInput('icon', 'circle-check');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('svg')).not.toBeNull();
    // The label still carries the meaning; the icon only reinforces it.
    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe('COMPLETED');
  });
});
