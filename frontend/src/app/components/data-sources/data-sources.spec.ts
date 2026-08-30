import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DataSources } from './data-sources';

describe('DataSources', () => {
  let component: DataSources;
  let fixture: ComponentFixture<DataSources>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DataSources],
    }).compileComponents();

    fixture = TestBed.createComponent(DataSources);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
