import { TestBed } from '@angular/core/testing';

import { LayoutsService } from './layouts.service';

describe('LayoutsService', () => {
  let service: LayoutsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LayoutsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

