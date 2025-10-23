import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StripeTest } from './stripe-test';

describe('StripeTest', () => {
  let component: StripeTest;
  let fixture: ComponentFixture<StripeTest>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StripeTest]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StripeTest);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
