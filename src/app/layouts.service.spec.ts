import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { LayoutsService } from './layouts.service';

describe('LayoutsService', () => {
  let service: LayoutsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(LayoutsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

