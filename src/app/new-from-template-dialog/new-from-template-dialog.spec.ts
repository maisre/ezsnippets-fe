import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';

import { NewFromTemplateDialog, NewKind } from './new-from-template-dialog';
import { Template } from '../models';

const PAGE_TEMPLATE: Template = {
  id: 't-page',
  name: 'Sales landing',
  kind: 'page',
  tags: [],
  snippetIds: ['s1', 's2', 's3'],
  subPages: [],
};

const LAYOUT_TEMPLATE: Template = {
  id: 't-layout',
  name: 'SaaS site',
  kind: 'layout',
  tags: [],
  snippetIds: [],
  nav: 'nav1',
  footer: 'foot1',
  subPages: [
    { name: 'Home', snippetIds: ['a'] },
    { name: 'Pricing', snippetIds: ['b'] },
  ],
};

describe('NewFromTemplateDialog', () => {
  let fixture: ComponentFixture<NewFromTemplateDialog>;
  let component: NewFromTemplateDialog;
  let http: HttpTestingController;
  let router: Router;

  function open(kind: NewKind, templates: Template[]) {
    fixture = TestBed.createComponent(NewFromTemplateDialog);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('kind', kind);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith(`/templates?kind=${kind}`)).flush(templates);
    fixture.detectChanges();
  }

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NewFromTemplateDialog],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
  });

  afterEach(() => {
    http.verify();
    document.body.style.overflow = '';
  });

  it('offers page templates and creates a page from one', () => {
    open('page', [PAGE_TEMPLATE]);
    expect(text()).toContain('New page');
    expect(text()).toContain('Blank page');
    expect(text()).toContain('3 sections');
    expect(component.pageIds(PAGE_TEMPLATE, 0)).toEqual(['s1', 's2', 's3']);

    component.choose(PAGE_TEMPLATE);
    component.form.name = 'Acme landing';
    component.create();
    const req = http.expectOne((r) => r.url.endsWith('/pages/from-template/t-page'));
    expect(req.request.body.name).toBe('Acme landing');
    req.flush({ id: 'p1' });
    expect(router.navigate).toHaveBeenCalledWith(['/p/edit', 'p1']);
  });

  it('creates a blank page with no snippets', () => {
    open('page', []);
    component.choose('blank');
    component.form.name = 'Empty';
    component.create();
    const req = http.expectOne((r) => r.method === 'POST' && /\/pages$/.test(r.url));
    expect(req.request.body.snippets).toEqual([]);
    req.flush({ id: 'p2' });
    expect(router.navigate).toHaveBeenCalledWith(['/p/edit', 'p2']);
  });

  it('keeps the layout flow: nav + page + footer previews and /l/edit', () => {
    open('layout', [LAYOUT_TEMPLATE]);
    expect(text()).toContain('New layout');
    expect(text()).toContain('2 pages');
    expect(component.pageIds(LAYOUT_TEMPLATE, 1)).toEqual(['nav1', 'b', 'foot1']);

    component.choose(LAYOUT_TEMPLATE);
    component.form.name = 'Acme site';
    component.create();
    http.expectOne((r) => r.url.endsWith('/layouts/from-template/t-layout')).flush({ id: 'l1' });
    expect(router.navigate).toHaveBeenCalledWith(['/l/edit', 'l1']);
  });

  it('shows the plan-limit message on a 403', () => {
    open('page', []);
    component.choose('blank');
    component.form.name = 'One too many';
    component.create();
    http
      .expectOne((r) => r.method === 'POST' && /\/pages$/.test(r.url))
      .flush({}, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(component.limitReached).toBeTrue();
    expect(text()).toContain("You've reached your plan's page limit");
  });
});
