import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MetricCard } from './metric-card';

describe('MetricCard', () => {
  let component: MetricCard;
  let fixture: ComponentFixture<MetricCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MetricCard],
    }).compileComponents();

    fixture = TestBed.createComponent(MetricCard);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('label', 'Total block minutes');
    fixture.componentRef.setInput('value', 2050);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the metric label and value', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('dt')?.textContent).toContain('Total block minutes');
    expect(element.querySelector('dd')?.textContent).toContain('2050');
  });

  it('omits the hint when none is supplied', () => {
    expect((fixture.nativeElement as HTMLElement).querySelector('p')).toBeNull();
  });

  it('shows the hint when supplied', async () => {
    fixture.componentRef.setInput('hint', 'Infrastructure downtime');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('p')?.textContent).toContain(
      'Infrastructure downtime',
    );
  });

  it('colours a bad metric differently from a neutral one', async () => {
    fixture.componentRef.setInput('tone', 'bad');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('dd')?.className).toContain(
      'text-rail-red',
    );
  });

  it('renders an icon only when one is named', async () => {
    expect((fixture.nativeElement as HTMLElement).querySelector('svg')).toBeNull();

    fixture.componentRef.setInput('icon', 'timer');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('svg')).not.toBeNull();
  });
});
