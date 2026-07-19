import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideRouter } from '@angular/router';
import { PageEdit } from './page-edit';

const PAGE = {
  id: 'p1',
  name: 'Landing',
  siteName: 'Acme',
  description: 'Marketing site',
  snippets: [],
};

describe('PageEdit details form', () => {
  let fixture: ComponentFixture<PageEdit>;
  let component: PageEdit;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PageEdit],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'p1' }) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PageEdit);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);

    fixture.detectChanges();

    httpMock
      .expectOne((r) => r.method === 'GET' && r.url.endsWith('/pages/p1'))
      .flush(PAGE);

    // The editor also loads the snippet palette on init; not under test here.
    httpMock
      .match((r) => r.url.includes('/snippets/summary'))
      .forEach((r) => r.flush([]));
    httpMock
      .match((r) => r.url.includes('/snippets/filters'))
      .forEach((r) => r.flush({ types: [], tags: [] }));

    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('seeds the form from the loaded page and starts clean', () => {
    expect(component.details).toEqual({
      name: 'Landing',
      siteName: 'Acme',
      description: 'Marketing site',
    });
    expect(component.detailsDirty).toBe(false);
  });

  it('becomes dirty on edit and reverts on cancel', () => {
    component.details.name = 'Landing v2';
    expect(component.detailsDirty).toBe(true);

    component.resetDetails();
    expect(component.details.name).toBe('Landing');
    expect(component.detailsDirty).toBe(false);
  });

  it('PUTs only the three metadata fields, trimmed', () => {
    component.details.name = '  Landing v2  ';
    component.details.description = 'Updated copy';
    component.saveDetails();

    const req = httpMock.expectOne(
      (r) => r.method === 'PUT' && r.url.endsWith('/pages/p1'),
    );
    expect(req.request.body).toEqual({
      name: 'Landing v2',
      siteName: 'Acme',
      description: 'Updated copy',
    });

    req.flush({ ...PAGE, name: 'Landing v2', description: 'Updated copy' });

    expect(component.page!.name).toBe('Landing v2');
    expect(component.detailsDirty).toBe(false);
    expect(component.savingDetails).toBe(false);
  });

  it('clears an optional field when emptied', () => {
    component.details.siteName = '';
    component.saveDetails();

    const req = httpMock.expectOne(
      (r) => r.method === 'PUT' && r.url.endsWith('/pages/p1'),
    );
    expect(req.request.body.siteName).toBe('');
    req.flush({ ...PAGE, siteName: '' });
  });

  it('refuses to save an empty name and does not call the API', () => {
    component.details.name = '   ';
    component.saveDetails();

    expect(component.detailsError).toBe('Name is required.');
    httpMock.expectNone((r) => r.method === 'PUT');
  });

  it('surfaces a save failure and keeps the edit', () => {
    component.details.name = 'Landing v2';
    component.saveDetails();

    httpMock
      .expectOne((r) => r.method === 'PUT' && r.url.endsWith('/pages/p1'))
      .flush({}, { status: 500, statusText: 'Server Error' });

    expect(component.detailsError).toContain('Could not save');
    expect(component.savingDetails).toBe(false);
    // The edit survives so the user can retry rather than losing their typing.
    expect(component.details.name).toBe('Landing v2');
    expect(component.detailsDirty).toBe(true);
  });
});
