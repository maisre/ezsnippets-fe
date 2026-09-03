import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { SnippetsService } from './snippets.service';

describe('SnippetsService', () => {
  let service: SnippetsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SnippetsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
