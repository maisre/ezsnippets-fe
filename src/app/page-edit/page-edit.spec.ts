import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from '@angular/router';

import { PageEdit } from './page-edit';

describe('PageEdit', () => {
  let component: PageEdit;
  let fixture: ComponentFixture<PageEdit>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PageEdit],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        // The editor reads its id straight off the route snapshot and
        // fetches on init, so both have to be in place before
        // detectChanges or it throws instead of rendering.
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ id: 'x1' }) },
          },
        },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(PageEdit);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);

    fixture.detectChanges();
  });

  afterEach(() => {
    // The load-on-init requests aren't what's under test here, but leaving
    // them unflushed would leak between specs. Answering one round kicks off
    // the next (the page loads, then its snippets), so drain until quiet
    // rather than verifying after a single pass.
    for (let i = 0; i < 10; i++) {
      const open = httpMock.match(() => true);
      if (!open.length) break;
      open.forEach((req) => req.flush([]));
    }
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
