import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Icon } from './icon';

describe('Icon', () => {
  let component: Icon;
  let fixture: ComponentFixture<Icon>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Icon],
    }).compileComponents();

    fixture = TestBed.createComponent(Icon);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('name', 'train-front');
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the Lucide path data for the named icon', () => {
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg');

    expect(svg).not.toBeNull();
    expect(svg?.innerHTML).toContain('path');
  });

  it('hides a decorative icon from assistive technology', () => {
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg');

    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('role')).toBeNull();
  });

  it('exposes a labelled icon as an image with its label', async () => {
    fixture.componentRef.setInput('label', 'Warning');
    await fixture.whenStable();

    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg');

    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Warning');
    expect(svg?.getAttribute('aria-hidden')).toBeNull();
  });

  it('applies the requested size classes', async () => {
    fixture.componentRef.setInput('size', 'h-6 w-6');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('svg')?.getAttribute('class')).toBe(
      'h-6 w-6',
    );
  });
});
