import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LayoutEdit } from './layout-edit';

describe('LayoutEdit', () => {
  let component: LayoutEdit;
  let fixture: ComponentFixture<LayoutEdit>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LayoutEdit]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LayoutEdit);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
