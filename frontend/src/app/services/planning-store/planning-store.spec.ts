import { TestBed } from '@angular/core/testing';
import { Api, ApiError } from '../../core/api/api';
import { PlanningStore } from './planning-store';

const PLAN = {
  id: 'plan-1',
  planType: 'OPTIMIZED',
  solverStatus: 'OPTIMAL',
  scheduledTasks: 30,
  totalTasks: 96,
};

const BLOCKS = [
  {
    id: 'b1',
    sectionId: 's1',
    sectionCode: 'SEC-A-01',
    sectionName: 'Ambala - Barog',
    departments: ['ENG', 'TRD'],
    blockType: 'INTEGRATED',
    tasks: [
      { maintenanceTaskId: 't1', department: 'ENG' },
      { maintenanceTaskId: 't2', department: 'TRD' },
    ],
  },
  {
    id: 'b2',
    sectionId: 's1',
    sectionCode: 'SEC-A-01',
    sectionName: 'Ambala - Barog',
    departments: ['SNT'],
    blockType: 'DISCONNECTION',
    tasks: [{ maintenanceTaskId: 't3', department: 'SNT' }],
  },
  {
    id: 'b3',
    sectionId: 's2',
    sectionCode: 'SEC-A-02',
    sectionName: 'Barog - Chandail',
    departments: ['ENG'],
    blockType: 'LINE',
    tasks: [{ maintenanceTaskId: 't4', department: 'ENG' }],
  },
];

const UNSCHEDULED = [
  { id: 'u1', reasonCode: 'TRAIN_CONFLICT', severity: 'CRITICAL', safetyCritical: true },
  { id: 'u2', reasonCode: 'TRAIN_CONFLICT', severity: 'HIGH', safetyCritical: false },
  { id: 'u3', reasonCode: 'INSUFFICIENT_DURATION', severity: 'CRITICAL', safetyCritical: false },
];

class FakeApi {
  getError: unknown = null;
  postError: unknown = null;
  postBodies: unknown[] = [];

  async get<T>(path: string): Promise<T> {
    if (this.getError) throw this.getError;
    if (path === '/plans/plan-1') return PLAN as T;
    if (path === '/plans/plan-1/blocks') return BLOCKS as T;
    if (path === '/plans/plan-1/unscheduled-tasks') return UNSCHEDULED as T;
    if (path.startsWith('/plans/compare')) {
      return { optimized: PLAN, baseline: PLAN, comparison: [] } as T;
    }
    return [] as T;
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    this.postBodies.push(body);
    if (this.postError) throw this.postError;

    return {
      runId: 'run-1',
      optimizedPlanId: 'plan-1',
      baselinePlanId: 'plan-2',
      solverType: 'GLPK',
      solverStatus: 'OPTIMAL',
      comparison: [],
    } as T;
  }
}

describe('PlanningStore', () => {
  let service: PlanningStore;
  let api: FakeApi;

  beforeEach(() => {
    api = new FakeApi();

    TestBed.configureTestingModule({
      providers: [{ provide: Api, useValue: api }],
    });

    service = TestBed.inject(PlanningStore);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('starts with no plan, not loading, and no error', () => {
    expect(service.hasPlan()).toBe(false);
    expect(service.generating()).toBe(false);
    expect(service.error()).toBeNull();
    expect(service.stage()).toBeNull();
  });

  it('loads a plan with its blocks and unscheduled tasks', async () => {
    await service.loadPlan('plan-1');

    expect(service.hasPlan()).toBe(true);
    expect(service.hasBlocks()).toBe(true);
    expect(service.blocks().length).toBe(3);
    expect(service.unscheduled().length).toBe(3);
    expect(service.loading()).toBe(false);
  });

  it('reports OPTIMAL only for a genuine GLPK optimum', async () => {
    await service.loadPlan('plan-1');

    expect(service.isOptimal()).toBe(true);
    expect(service.usedFallback()).toBe(false);
  });

  it('groups blocks by section for the timeline', async () => {
    await service.loadPlan('plan-1');

    const groups = service.blocksBySection();

    expect(groups.length).toBe(2);
    expect(groups[0].sectionCode).toBe('SEC-A-01');
    expect(groups[0].blocks.length).toBe(2);
    expect(groups[1].blocks.length).toBe(1);
  });

  it('identifies multi-department blocks', async () => {
    await service.loadPlan('plan-1');

    expect(service.integratedBlocks().length).toBe(1);
    expect(service.integratedBlocks()[0].id).toBe('b1');
  });

  it('counts scheduled tasks per department', async () => {
    await service.loadPlan('plan-1');

    expect(service.departmentTaskCounts()).toEqual({ ENG: 2, TRD: 1, SNT: 1 });
  });

  it('groups unscheduled tasks by reason, largest group first', async () => {
    await service.loadPlan('plan-1');

    const groups = service.unscheduledByReason();

    expect(groups[0].reasonCode).toBe('TRAIN_CONFLICT');
    expect(groups[0].tasks.length).toBe(2);
    expect(groups[1].reasonCode).toBe('INSUFFICIENT_DURATION');
  });

  it('separates critical from safety-critical unscheduled work', async () => {
    await service.loadPlan('plan-1');

    expect(service.criticalUnscheduled().length).toBe(2);
    expect(service.safetyCriticalUnscheduled().length).toBe(1);
  });

  it('sets and clears the generating flag around a successful run', async () => {
    const pending = service.generate({ horizonType: 'WEEKLY', horizonStart: '2026-08-30T00:00:00Z' });

    expect(service.generating()).toBe(true);

    const result = await pending;

    expect(result?.optimizedPlanId).toBe('plan-1');
    expect(service.generating()).toBe(false);
    expect(service.stage()).toBeNull();
    expect(service.hasPlan()).toBe(true);
  });

  it('captures the server error message when generation fails', async () => {
    api.postError = new ApiError('CONFLICT', 'No corridor block windows fall inside this horizon.');

    const result = await service.generate({
      horizonType: 'WEEKLY',
      horizonStart: '2026-08-30T00:00:00Z',
    });

    expect(result).toBeNull();
    expect(service.error()).toBe('No corridor block windows fall inside this horizon.');
    expect(service.generating()).toBe(false);
    expect(service.stage()).toBeNull();
  });

  it('refuses to start a second run while one is in flight', async () => {
    const first = service.generate({ horizonType: 'WEEKLY', horizonStart: '2026-08-30T00:00:00Z' });
    const second = await service.generate({
      horizonType: 'WEEKLY',
      horizonStart: '2026-08-30T00:00:00Z',
    });

    expect(second).toBeNull();
    await first;
    expect(api.postBodies.length).toBe(1);
  });

  it('clears a previous error on request', async () => {
    api.postError = new ApiError('FAILED', 'boom');
    await service.generate({ horizonType: 'WEEKLY', horizonStart: '2026-08-30T00:00:00Z' });

    expect(service.error()).toBe('boom');

    service.clearError();

    expect(service.error()).toBeNull();
  });
});
