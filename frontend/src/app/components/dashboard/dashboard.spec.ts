import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Api } from '../../core/api/api';
import { Dashboard } from './dashboard';

const SUMMARY = {
  totals: {
    totalTasks: 187,
    readyTasks: 187,
    plannedTasks: 0,
    deferredTasks: 0,
    criticalTasks: 31,
    safetyCriticalTasks: 24,
    overdueTasks: 42,
    engTasks: 68,
    trdTasks: 59,
    sntTasks: 60,
    mlScoredTasks: 187,
    ruleScoredTasks: 0,
    averagePriorityScore: 24.1,
  },
  byDepartment: [],
  bySeverity: [],
};

const PLAN = {
  id: 'plan-1',
  planType: 'OPTIMIZED',
  horizonType: 'WEEKLY',
  solverStatus: 'OPTIMAL',
  totalTasks: 187,
  scheduledTasks: 40,
  unscheduledTasks: 147,
  criticalTasksScheduled: 18,
  criticalTasksUnscheduled: 2,
  totalBlockCount: 21,
  totalBlockMinutes: 2400,
  assetAvailabilityPercentage: 98.1,
  trainImpactScore: 280,
  multiDepartmentBlockCount: 11,
};

/** Configurable fake so each test can pick the stage it wants to render. */
class FakeApi {
  sources: unknown[] = [];
  runs: unknown[] = [];

  async get<T>(path: string): Promise<T> {
    if (path === '/health') {
      return {
        status: 'ok',
        database: 'connected',
        databaseError: null,
        dataOrigin: 'SYNTHETIC',
        notice: '',
      } as T;
    }
    if (path === '/sources') return this.sources as T;
    if (path === '/maintenance/tasks') return [] as T;
    if (path === '/maintenance/summary') return SUMMARY as T;
    if (path === '/corridors') return [] as T;
    if (path === '/sections') return [] as T;
    if (path === '/planning/runs') return this.runs as T;
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
    if (path === '/plans/plan-1') return PLAN as T;
    if (path === '/plans/plan-1/blocks') return [] as T;
    if (path === '/plans/plan-1/unscheduled-tasks') return [] as T;
    if (path.startsWith('/plans/compare')) {
      return { optimized: PLAN, baseline: PLAN, comparison: [] } as T;
    }
    return [] as T;
  }

  async post<T>(): Promise<T> {
    return [] as T;
  }
}

function sourceRow(code: string) {
  return {
    id: `id-${code}`,
    code,
    name: code,
    adapterType: 'MOCK',
    lastSyncAt: '2026-08-30 10:00:00.000',
    lastSyncStatus: 'COMPLETED',
    recordCount: 40,
    department: null,
    kind: null,
    synthetic: true,
  };
}

async function build(api: FakeApi): Promise<ComponentFixture<Dashboard>> {
  await TestBed.configureTestingModule({
    imports: [Dashboard],
    providers: [provideRouter([]), { provide: Api, useValue: api }],
  }).compileComponents();

  const fixture = TestBed.createComponent(Dashboard);
  await fixture.whenStable();
  await fixture.whenStable();

  return fixture;
}

describe('Dashboard', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('should create', async () => {
    const fixture = await build(new FakeApi());

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('leads with the loading step when no source has been read yet', async () => {
    const fixture = await build(new FakeApi());
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Start by loading the six data sources');
    // The six inputs are named so the user knows what is about to happen.
    expect(text).toContain('TMS');
    expect(text).toContain('GOODS_FORECAST');
  });

  it('asks for a plan once the data is loaded but nothing is planned', async () => {
    const api = new FakeApi();
    api.sources = [sourceRow('TMS'), sourceRow('COA')];

    const fixture = await build(api);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('The data is loaded. Now generate a plan.');
    expect(text).not.toContain('Start by loading the six data sources');
  });

  it('summarises the backlog once sources are loaded', async () => {
    const api = new FakeApi();
    api.sources = [sourceRow('TMS')];

    const fixture = await build(api);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Tasks waiting for a block');
    expect(text).toContain('187');
    // Department split is labelled, not colour-only.
    expect(text).toContain('Engineering (track)');
    expect(text).toContain('Signal & Telecommunication');
  });

  it('states what the plan achieved in a sentence, not just numbers', async () => {
    const api = new FakeApi();
    api.sources = [sourceRow('TMS')];
    api.runs = [{ id: 'run-1', status: 'COMPLETED', horizonType: 'WEEKLY' }];

    const fixture = await build(api);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    // 40 of 187 is 21%.
    expect(text).toContain('21%');
    expect(text).toContain('OPTIMAL');
    expect(text).toContain('2 critical task(s) still have no safe slot');
  });
});
