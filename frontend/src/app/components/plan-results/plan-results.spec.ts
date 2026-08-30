import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Api } from '../../core/api/api';
import { PlanResults } from './plan-results';

const PLAN = {
  id: 'plan-1',
  planningRunId: 'run-1',
  planType: 'OPTIMIZED',
  horizonType: 'WEEKLY',
  horizonStart: '2026-08-30 00:00:00.000',
  horizonEnd: '2026-09-06 00:00:00.000',
  totalTasks: 96,
  scheduledTasks: 30,
  unscheduledTasks: 66,
  criticalTasksScheduled: 14,
  criticalTasksUnscheduled: 4,
  totalBlockCount: 19,
  totalBlockMinutes: 2050,
  assetAvailabilityPercentage: 97.966,
  trainImpactScore: 261.033,
  multiDepartmentBlockCount: 9,
  solverStatus: 'OPTIMAL',
  createdAt: '2026-08-30 07:00:00.000',
};

const BLOCKS = [
  {
    id: 'block-1',
    blockWindowId: 'w-1',
    corridorId: 'c-1',
    corridorCode: 'COR-A',
    sectionId: 's-1',
    sectionCode: 'SEC-A-01',
    sectionName: 'Ambala - Barog',
    startsAt: '2026-08-30 19:00:00.000',
    endsAt: '2026-08-30 21:20:00.000',
    blockType: 'INTEGRATED',
    departments: ['TRD', 'SNT'],
    utilizationPercentage: 77.8,
    trainImpactScore: 3.2,
    tasks: [
      {
        maintenanceTaskId: 't-1',
        plannedStart: '2026-08-30 19:00:00.000',
        plannedEnd: '2026-08-30 20:30:00.000',
        sequenceNumber: 1,
        title: 'Cable meggering on SEC-A-01',
        department: 'SNT',
        severity: 'MEDIUM',
        taskType: 'CABLE_MEGGERING',
        priorityScore: 61.2,
        prioritySource: 'ML',
        predictedDurationMinutes: 90,
        requestedDurationMinutes: 60,
        safetyCritical: false,
        assignmentReason: null,
      },
    ],
  },
];

const UNSCHEDULED = [
  {
    id: 'u-1',
    maintenanceTaskId: 't-9',
    reasonCode: 'POWER_ISOLATION_UNAVAILABLE',
    explanation: 'This task needs traction power isolation, which this window does not offer',
    title: 'Section isolator SI-11 servicing',
    department: 'TRD',
    severity: 'HIGH',
    taskType: 'ISOLATOR_SERVICING',
    priorityScore: 71.4,
    dueAt: '2026-09-02 00:00:00.000',
    daysOverdue: 0,
    predictedDurationMinutes: 150,
    requestedDurationMinutes: 120,
    safetyCritical: false,
    sectionCode: 'SEC-A-02',
    sectionName: 'Barog - Chandail',
  },
];

class FakeApi {
  async get<T>(path: string): Promise<T> {
    if (path === '/plans/plan-1') return PLAN as T;
    if (path === '/plans/plan-1/blocks') return BLOCKS as T;
    if (path === '/plans/plan-1/unscheduled-tasks') return UNSCHEDULED as T;
    if (path === '/planning/runs') return [] as T;
    return [] as T;
  }

  async post<T>(): Promise<T> {
    return undefined as T;
  }
}

describe('PlanResults', () => {
  let component: PlanResults;
  let fixture: ComponentFixture<PlanResults>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlanResults],
      providers: [provideRouter([]), { provide: Api, useValue: new FakeApi() }],
    }).compileComponents();

    fixture = TestBed.createComponent(PlanResults);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('id', 'plan-1');
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the calculated plan metrics', async () => {
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('30 of 96');
    expect(text).toContain('2050');
    expect(text).toContain('97.966%');
    expect(text).toContain('9');
  });

  it('reports the solver status and explains what it means', async () => {
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('OPTIMAL');
    expect(text).toContain('proved no better plan exists');
  });

  it('shows the integrated block with both department chips', async () => {
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Integrated block');
    expect(text).toContain('TRD');
    expect(text).toContain('S&T');
  });

  it('renders each unscheduled task with a plain-language reason', async () => {
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Power isolation unavailable');
    expect(text).toContain('Section isolator SI-11 servicing');
    expect(text).toContain('which this window does not offer');
  });

  it('positions a task bar inside the bounds of its block', () => {
    const style = component['barStyle'](
      BLOCKS[0] as never,
      '2026-08-30 19:00:00.000',
      '2026-08-30 20:30:00.000',
    );

    expect(style).toContain('left:0%');
    // 90 minutes of a 140-minute block is roughly 64%.
    expect(style).toMatch(/width:6[0-9](\.\d+)?%/);
  });

  it('computes block duration in minutes', () => {
    expect(
      component['durationMinutes']('2026-08-30 19:00:00.000', '2026-08-30 21:20:00.000'),
    ).toBe(140);
  });
});
