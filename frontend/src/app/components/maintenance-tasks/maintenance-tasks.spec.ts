import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MaintenanceTask } from '../../core/models/maintenance';
import { MaintenanceTasks } from './maintenance-tasks';

describe('MaintenanceTasks', () => {
  let component: MaintenanceTasks;
  let fixture: ComponentFixture<MaintenanceTasks>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MaintenanceTasks],
    }).compileComponents();

    fixture = TestBed.createComponent(MaintenanceTasks);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps multiple task detail panels open independently', () => {
    const first = { id: 'task-1' } as MaintenanceTask;
    const second = { id: 'task-2' } as MaintenanceTask;
    const view = component as unknown as {
      toggleDetail(task: MaintenanceTask): void;
      isExpanded(taskId: string): boolean;
    };

    view.toggleDetail(first);
    view.toggleDetail(second);

    expect(view.isExpanded(first.id)).toBe(true);
    expect(view.isExpanded(second.id)).toBe(true);

    view.toggleDetail(first);

    expect(view.isExpanded(first.id)).toBe(false);
    expect(view.isExpanded(second.id)).toBe(true);
  });
});
