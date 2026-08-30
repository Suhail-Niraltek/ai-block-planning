import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Api } from '../../core/api/api';
import { PlanComparison } from './plan-comparison';

const COMPARISON_ROWS = [
  {
    key: 'scheduledTasks',
    label: 'Scheduled tasks',
    higherIsBetter: true,
    optimized: 30,
    baseline: 27,
    delta: 3,
    improved: true,
  },
  {
    key: 'criticalTasksScheduled',
    label: 'Critical tasks scheduled',
    higherIsBetter: true,
    optimized: 14,
    baseline: 9,
    delta: 5,
    improved: true,
  },
  {
    key: 'totalBlockMinutes',
    label: 'Total block minutes',
    higherIsBetter: false,
    optimized: 2050,
    baseline: 2955,
    delta: -905,
    improved: true,
  },
  {
    key: 'multiDepartmentBlockCount',
    label: 'Multi-department blocks',
    higherIsBetter: true,
    optimized: 9,
    baseline: 0,
    delta: 9,
    improved: true,
  },
  {
    key: 'trainImpactScore',
    label: 'Train impact score',
    higherIsBetter: false,
    optimized: 500,
    baseline: 457,
    delta: 43,
    improved: false,
  },
  {
    key: 'assetAvailabilityPercentage',
    label: 'Asset availability %',
    higherIsBetter: true,
    optimized: 97.9,
    baseline: 97.9,
    delta: 0,
    improved: null,
  },
];

class FakeApi {
  async get<T>(path: string): Promise<T> {
    if (path === '/planning/runs') {
      return [
        {
          id: 'run-1',
          status: 'COMPLETED',
          horizonType: 'WEEKLY',
          horizonStart: '2026-08-30 00:00:00.000',
          horizonEnd: '2026-09-06 00:00:00.000',
          solverType: 'GLPK',
        },
      ] as T;
    }

    if (path === '/planning/runs/run-1') {
      return {
        id: 'run-1',
        status: 'COMPLETED',
        plans: [
          { id: 'plan-1', planType: 'OPTIMIZED' },
          { id: 'plan-2', planType: 'BASELINE' },
        ],
      } as T;
    }

    if (path === '/plans/plan-1') {
      return { id: 'plan-1', planType: 'OPTIMIZED', solverStatus: 'OPTIMAL', horizonType: 'WEEKLY' } as T;
    }

    if (path.startsWith('/plans/compare')) {
      return {
        optimized: { id: 'plan-1', solverStatus: 'OPTIMAL', horizonType: 'WEEKLY' },
        baseline: { id: 'plan-2', solverStatus: 'FALLBACK_FEASIBLE', horizonType: 'WEEKLY' },
        comparison: COMPARISON_ROWS,
      } as T;
    }

    return [] as T;
  }

  async post<T>(): Promise<T> {
    return undefined as T;
  }
}

describe('PlanComparison', () => {
  let component: PlanComparison;
  let fixture: ComponentFixture<PlanComparison>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlanComparison],
      providers: [provideRouter([]), { provide: Api, useValue: new FakeApi() }],
    }).compileComponents();

    fixture = TestBed.createComponent(PlanComparison);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads the latest run and its comparison rows', async () => {
    await fixture.whenStable();

    expect(component['rows']().length).toBe(COMPARISON_ROWS.length);
  });

  it('counts improved and regressed metrics separately', async () => {
    await fixture.whenStable();

    expect(component['improvedCount']()).toBe(4);
    expect(component['regressedCount']()).toBe(1);
  });

  it('formats a negative delta with its own sign', () => {
    expect(component['formatDelta'](COMPARISON_ROWS[2] as never)).toBe('-905');
  });

  it('formats a positive delta with a leading plus', () => {
    expect(component['formatDelta'](COMPARISON_ROWS[0] as never)).toBe('+3');
  });

  it('reports an unchanged metric as "no change" rather than as an improvement', () => {
    expect(component['formatDelta'](COMPARISON_ROWS[5] as never)).toBe('no change');
    expect(component['deltaClass'](COMPARISON_ROWS[5] as never)).toContain('text-slate-500');
  });

  it('colours a fall in block minutes as good and a rise in train impact as bad', () => {
    expect(component['deltaClass'](COMPARISON_ROWS[2] as never)).toContain('emerald');
    expect(component['deltaClass'](COMPARISON_ROWS[4] as never)).toContain('rail-red');
  });

  it('renders each metric with its own direction label so a delta is never ambiguous', async () => {
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Higher is better');
    expect(text).toContain('Lower is better');
  });

  it('shows critical coverage as its own row rather than folding it into block minutes', async () => {
    await fixture.whenStable();

    const rows = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'),
    ).map((row) => row.textContent ?? '');

    expect(rows.some((row) => row.includes('Critical tasks scheduled'))).toBe(true);
    expect(rows.some((row) => row.includes('Total block minutes'))).toBe(true);
  });

  it('marks a regressed metric as Worse in the verdict column', async () => {
    await fixture.whenStable();

    const impactRow = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'),
    ).find((row) => row.textContent?.includes('Train impact score'));

    expect(impactRow?.textContent).toContain('Worse');
  });
});
