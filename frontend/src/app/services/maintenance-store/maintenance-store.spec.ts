import { TestBed } from '@angular/core/testing';
import { Api, ApiError } from '../../core/api/api';
import { MaintenanceStore } from './maintenance-store';

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    externalId: 'TMS-DEF-001',
    department: 'ENG',
    taskType: 'RAIL_GRINDING',
    title: 'Rail grinding',
    dueAt: '2026-09-02 00:00:00.000',
    requestedDurationMinutes: 60,
    predictedDurationMinutes: 90,
    predictedDurationSampleCount: 61,
    requiresLineBlock: true,
    requiresPowerBlock: false,
    requiresDisconnection: false,
    severity: 'HIGH',
    criticality: 4,
    safetyCritical: false,
    daysOverdue: 0,
    priorityScore: 55,
    prioritySource: 'ML',
    priorityReasons: [],
    status: 'READY',
    sectionId: 'section-1',
    sectionCode: 'SEC-A-01',
    ...overrides,
  };
}

const TASKS = [
  task({ id: 't1', department: 'ENG', severity: 'CRITICAL', priorityScore: 90, daysOverdue: 6 }),
  task({ id: 't2', department: 'ENG', severity: 'LOW', priorityScore: 20, daysOverdue: 0 }),
  task({ id: 't3', department: 'TRD', severity: 'HIGH', priorityScore: 60, daysOverdue: 3 }),
  task({
    id: 't4',
    department: 'SNT',
    severity: 'CRITICAL',
    priorityScore: 80,
    daysOverdue: 0,
    prioritySource: 'RULE_FALLBACK',
    sectionId: 'section-2',
    sectionCode: 'SEC-A-02',
  }),
];

class FakeApi {
  getError: unknown = null;
  postError: unknown = null;

  async get<T>(path: string): Promise<T> {
    if (this.getError) throw this.getError;
    if (path === '/maintenance/tasks') return TASKS as T;
    if (path === '/maintenance/summary') {
      return { totals: { totalTasks: 4 }, byDepartment: [], bySeverity: [] } as T;
    }
    if (path === '/corridors') return [{ id: 'c1', code: 'COR-A' }] as T;
    if (path === '/sections') {
      return [
        { id: 'section-1', corridorId: 'c1', code: 'SEC-A-01' },
        { id: 'section-2', corridorId: 'c1', code: 'SEC-A-02' },
      ] as T;
    }
    return [] as T;
  }

  async post<T>(): Promise<T> {
    if (this.postError) throw this.postError;

    return {
      tasksScored: 4,
      mlScored: 3,
      ruleScored: 1,
      historyRows: 900,
      minimumHistoryRows: 200,
      model: { available: true, reason: null, metrics: { validationRocAuc: 0.79 } },
      dataOrigin: 'SYNTHETIC',
      note: 'synthetic',
    } as T;
  }
}

describe('MaintenanceStore', () => {
  let service: MaintenanceStore;
  let api: FakeApi;

  beforeEach(async () => {
    api = new FakeApi();

    TestBed.configureTestingModule({
      providers: [{ provide: Api, useValue: api }],
    });

    service = TestBed.inject(MaintenanceStore);
    await service.load();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('loads tasks, summary, corridors and sections together', () => {
    expect(service.tasks().length).toBe(4);
    expect(service.summary()).not.toBeNull();
    expect(service.corridors().length).toBe(1);
    expect(service.sections().length).toBe(2);
  });

  it('shows every task when no filter is active', () => {
    expect(service.hasActiveFilters()).toBe(false);
    expect(service.filteredCount()).toBe(4);
  });

  it('filters by department', () => {
    service.setDepartment('ENG');

    expect(service.filteredCount()).toBe(2);
    expect(service.hasActiveFilters()).toBe(true);
  });

  it('filters by severity', () => {
    service.setSeverity('CRITICAL');

    expect(service.filteredCount()).toBe(2);
  });

  it('filters by section', () => {
    service.setSection('section-2');

    expect(service.filteredCount()).toBe(1);
    expect(service.filteredTasks()[0].id).toBe('t4');
  });

  it('filters to overdue work only', () => {
    service.setOverdueOnly(true);

    expect(service.filteredCount()).toBe(2);
  });

  it('filters by minimum priority score', () => {
    service.setMinPriority(70);

    expect(service.filteredCount()).toBe(2);
  });

  it('combines several filters', () => {
    service.setDepartment('ENG');
    service.setSeverity('CRITICAL');

    expect(service.filteredCount()).toBe(1);
    expect(service.filteredTasks()[0].id).toBe('t1');
  });

  it('recomputes the derived counts against the filtered set, not the whole list', () => {
    expect(service.criticalCount()).toBe(2);
    expect(service.overdueCount()).toBe(2);
    expect(service.mlScoredCount()).toBe(3);

    service.setDepartment('ENG');

    expect(service.criticalCount()).toBe(1);
    expect(service.overdueCount()).toBe(1);
    expect(service.mlScoredCount()).toBe(2);
  });

  it('counts tasks per department over the filtered set', () => {
    expect(service.departmentCounts()).toEqual({ ENG: 2, TRD: 1, SNT: 1 });

    service.setSeverity('CRITICAL');

    expect(service.departmentCounts()).toEqual({ ENG: 1, TRD: 0, SNT: 1 });
  });

  it('clears every filter at once', () => {
    service.setDepartment('ENG');
    service.setSeverity('CRITICAL');
    service.setMinPriority(50);

    service.clearFilters();

    expect(service.hasActiveFilters()).toBe(false);
    expect(service.filteredCount()).toBe(4);
  });

  it('selects and deselects a task for the detail panel', () => {
    expect(service.selectedTask()).toBeNull();

    service.selectTask('t3');

    expect(service.selectedTask()?.id).toBe('t3');

    service.selectTask(null);

    expect(service.selectedTask()).toBeNull();
  });

  it('stores the recalculation summary including the model metrics', async () => {
    await service.recalculate();

    expect(service.lastRecalculation()?.mlScored).toBe(3);
    expect(service.lastRecalculation()?.model.available).toBe(true);
    expect(service.recalculating()).toBe(false);
  });

  it('surfaces a load failure as an error message', async () => {
    api.getError = new ApiError('DATABASE_NOT_MIGRATED', 'Run "npm run migrate".');

    await service.load();

    expect(service.error()).toBe('Run "npm run migrate".');
    expect(service.loading()).toBe(false);
  });
});
