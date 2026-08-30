import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Api } from '../../core/api/api';
import { BlockPlanner } from './block-planner';

class FakeApi {
  postBodies: unknown[] = [];

  async get<T>(path: string): Promise<T> {
    if (path === '/corridors') {
      return [
        { id: '11111111-1111-4111-8111-111111111111', code: 'COR-A', name: 'Northern trunk', importanceScore: 5 },
        { id: '22222222-2222-4222-8222-222222222222', code: 'COR-B', name: 'Eastern feeder', importanceScore: 3 },
      ] as T;
    }
    if (path === '/sections') return [] as T;
    if (path === '/maintenance/tasks') return [] as T;
    if (path === '/maintenance/summary') {
      return { totals: {}, byDepartment: [], bySeverity: [] } as T;
    }
    return [] as T;
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    this.postBodies.push(body);

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

describe('BlockPlanner', () => {
  let component: BlockPlanner;
  let fixture: ComponentFixture<BlockPlanner>;
  let api: FakeApi;

  beforeEach(async () => {
    api = new FakeApi();

    await TestBed.configureTestingModule({
      imports: [BlockPlanner],
      // A matching route is needed because a successful run navigates to the plan.
      providers: [
        provideRouter([{ path: 'plans/:id', children: [] }]),
        { provide: Api, useValue: api },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BlockPlanner);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('defaults to a weekly horizon starting today', () => {
    const form = component['plannerForm'];

    expect(form.horizonType().value()).toBe('WEEKLY');
    expect(form.horizonStart().value()).toBe(new Date().toISOString().slice(0, 10));
  });

  it('is valid with the defaults, so the submit button is enabled', () => {
    expect(component['plannerForm']().valid()).toBe(true);
    expect(component['canSubmit']()).toBe(true);
  });

  it('becomes invalid when the start date is cleared', () => {
    component['plannerForm'].horizonStart().value.set('');

    expect(component['plannerForm']().valid()).toBe(false);
    expect(component['canSubmit']()).toBe(false);
  });

  it('reports the required-field message for a missing start date', () => {
    component['plannerForm'].horizonStart().value.set('');

    const messages = component['plannerForm']
      .horizonStart()
      .errors()
      .map((error) => error.message);

    expect(messages).toContain('Choose the first day of the planning horizon');
  });

  it('describes a weekly horizon as seven days', () => {
    component['plannerForm'].horizonStart().value.set('2026-08-31');

    expect(component['horizonDescription']()).toContain('2026-08-31 to 2026-09-07');
    expect(component['horizonDescription']()).toContain('7 days');
  });

  it('describes a monthly horizon as one calendar month', () => {
    component['plannerForm'].horizonType().value.set('MONTHLY');
    component['plannerForm'].horizonStart().value.set('2026-09-01');

    expect(component['horizonDescription']()).toContain('2026-09-01 to 2026-10-01');
    expect(component['horizonDescription']()).toContain('30 days');
  });

  it('toggles corridor selection', () => {
    const id = '11111111-1111-4111-8111-111111111111';

    component['toggleCorridor'](id, true);
    expect(component['selectedCorridorIds']().has(id)).toBe(true);

    component['toggleCorridor'](id, false);
    expect(component['selectedCorridorIds']().has(id)).toBe(false);
  });

  it('sends the start date as a UTC instant and omits corridors when none are chosen', async () => {
    component['plannerForm'].horizonStart().value.set('2026-08-31');

    await component['generate']();

    expect(api.postBodies[0]).toEqual({
      horizonType: 'WEEKLY',
      horizonStart: '2026-08-31T00:00:00.000Z',
    });
  });

  it('includes only the chosen corridors when some are selected', async () => {
    const id = '22222222-2222-4222-8222-222222222222';

    component['plannerForm'].horizonStart().value.set('2026-08-31');
    component['toggleCorridor'](id, true);

    await component['generate']();

    expect(api.postBodies[0]).toEqual({
      horizonType: 'WEEKLY',
      horizonStart: '2026-08-31T00:00:00.000Z',
      corridorIds: [id],
    });
  });

  it('does not submit an invalid form', async () => {
    component['plannerForm'].horizonStart().value.set('');

    await component['generate']();

    expect(api.postBodies.length).toBe(0);
  });
});
