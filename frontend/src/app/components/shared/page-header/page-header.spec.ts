import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PageHeader } from './page-header';

describe('PageHeader', () => {
  let component: PageHeader;
  let fixture: ComponentFixture<PageHeader>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PageHeader],
    }).compileComponents();

    fixture = TestBed.createComponent(PageHeader);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('icon', 'gauge');
    fixture.componentRef.setInput('title', 'Dashboard');
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the title as the page heading', () => {
    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent).toContain(
      'Dashboard',
    );
  });

  it('omits the description and step when they are not supplied', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).not.toContain('Step');
    expect((fixture.nativeElement as HTMLElement).querySelector('p')).toBeNull();
  });

  it('shows a step number when the page is part of the guided flow', async () => {
    fixture.componentRef.setInput('step', 3);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Step 3');
  });

  it('shows the orienting description when supplied', async () => {
    fixture.componentRef.setInput('description', 'What the optimizer decided and why.');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('p')?.textContent).toContain(
      'What the optimizer decided and why.',
    );
  });
});
