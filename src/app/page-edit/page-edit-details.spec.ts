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

    // ShareLinkService loads the org's custom domains to decide whether links
    // should use one. No active domain here, so links stay on the canonical host.
    httpMock
      .match((r) => r.url.endsWith('/domains'))
      .forEach((r) => r.flush([]));

    // The editor also loads the snippet palette on init; not under test here.
    httpMock
      .match((r) => r.url.includes('/snippets/summary'))
      .forEach((r) => r.flush([]));
    httpMock
      .match((r) => r.url.includes('/snippets/filters'))
      .forEach((r) => r.flush({ types: [], tags: [] }));
    // CreatorLabelsService — no workspaces means no "created by" label.
    httpMock.match((r) => r.url.endsWith('/orgs')).forEach((r) => r.flush([]));

    fixture.detectChanges();

    // The snippet drawer renders with the loaded page and fetches the team's
    // starred snippets then.
    httpMock
      .match((r) => r.url.endsWith('/orgs/favorites'))
      .forEach((r) => r.flush({ favorites: [] }));
  });

  afterEach(() => httpMock.verify());

  it('seeds the form from the loaded page and starts clean', () => {
    expect(component.details).toEqual({
      name: 'Landing',
      siteName: 'Acme',
      description: 'Marketing site',
      slug: '',
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

  it('PUTs only the metadata fields, trimmed', () => {
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
      slug: '',
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
  it('sends the slug and surfaces a server rejection verbatim', () => {
    component.details.slug = 'view';
    component.saveDetails();

    const req = httpMock.expectOne(
      (r) => r.method === 'PUT' && r.url.endsWith('/pages/p1'),
    );
    expect(req.request.body.slug).toBe('view');

    // Reserved words, collisions and bad characters all come back with a
    // specific message; a generic "try again" would leave the user stuck.
    req.flush(
      { message: '"view" is reserved. Pick another name.' },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(component.detailsError).toBe('"view" is reserved. Pick another name.');
  });

  it('previews the normalised slug, not the raw input', () => {
    component.details.slug = 'Stans HVAC';
    // Mirrors the server's slugify so the preview never disagrees with what
    // actually gets saved.
    expect(component.slugPreview).toContain('/stans-hvac');
    expect(component.slugPreview).not.toContain('Stans HVAC');
  });

  it('treats a slug change as dirty', () => {
    expect(component.detailsDirty).toBe(false);
    component.details.slug = 'stans-hvac';
    expect(component.detailsDirty).toBe(true);
  });

  describe('site brief', () => {
    it('saves only the brief fields, leaving a half-edited name alone', () => {
      component.details.description = '  Family-run HVAC in Boise  ';
      component.details.name = '';
      expect(component.briefDirty).toBe(true);
      expect(component.settingsDirty).toBe(true);

      component.saveBrief();

      const req = httpMock.expectOne(
        (r) => r.method === 'PUT' && r.url.endsWith('/pages/p1'),
      );
      // No name or slug: an invalid one in the settings card can't block this.
      expect(req.request.body).toEqual({
        siteName: 'Acme',
        description: 'Family-run HVAC in Boise',
      });
      req.flush({ ...PAGE, description: 'Family-run HVAC in Boise' });

      expect(component.briefDirty).toBe(false);
      expect(component.page!.description).toBe('Family-run HVAC in Boise');
      // The unsaved name edit survives.
      expect(component.details.name).toBe('');
      expect(component.settingsDirty).toBe(true);
    });

    it('cancels only its own half', () => {
      component.details.description = 'Changed';
      component.details.name = 'Landing v2';

      component.resetBrief();

      expect(component.details.description).toBe('Marketing site');
      expect(component.details.name).toBe('Landing v2');
    });

    it('saves a dirty brief before writing copy', () => {
      component.details.description = 'Family-run HVAC in Boise';
      component.customize(false);

      // Nothing is sent to the AI until the brief it reads is stored.
      httpMock.expectNone((r) => r.url.endsWith('/pages/p1/customize'));
      expect(component.customizing).toBe(true);
      httpMock
        .expectOne((r) => r.method === 'PUT' && r.url.endsWith('/pages/p1'))
        .flush({ ...PAGE, description: 'Family-run HVAC in Boise' });

      const run = httpMock.expectOne((r) => r.url.endsWith('/pages/p1/customize'));
      expect(run.request.body).toEqual({ onlyMissing: false });
      run.flush({
        ...PAGE,
        snippets: [
          { id: 's1', aiCustomized: true, textReplacementOverride: [{ token: 't', replacement: 'x' }] },
          // No editable text: marked done, but no copy was written for it.
          { id: 's2', aiCustomized: true },
        ],
      });

      expect(component.customizing).toBe(false);
      expect(component.copyNotice).toBe('Copy written for 1 section.');
    });

    it('does not run the AI when the brief cannot be saved', () => {
      component.details.description = 'Family-run HVAC in Boise';
      component.customize(false);

      httpMock
        .expectOne((r) => r.method === 'PUT' && r.url.endsWith('/pages/p1'))
        .flush({}, { status: 500, statusText: 'Server Error' });

      httpMock.expectNone((r) => r.url.endsWith('/pages/p1/customize'));
      expect(component.customizing).toBe(false);
      expect(component.customizeError).toContain('could not be saved');
      // The typing is kept for a retry.
      expect(component.details.description).toBe('Family-run HVAC in Boise');
    });

    it('runs straight away when the brief is already saved', () => {
      component.findImages({ replaceExisting: true });

      httpMock.expectNone((r) => r.method === 'PUT');
      const run = httpMock.expectOne((r) => r.url.endsWith('/pages/p1/customize-images'));
      expect(run.request.body.replaceExisting).toBe(true);
      run.flush({
        ...PAGE,
        imageFill: { mode: 'quick', fellBack: false, requested: 3, filled: 3 },
      });

      expect(component.imagesNotice).toBe('Filled 3 image slots.');
    });

    it('closes an open confirm when its action runs', () => {
      component.confirming = 'copy';
      component.customize(false);
      expect(component.confirming).toBeNull();
      httpMock.expectOne((r) => r.url.endsWith('/pages/p1/customize')).flush(PAGE);
    });
  });

  describe('theme', () => {
    it('shows the template default palette when no colours are saved', () => {
      expect(component.activeTheme).toBe('Slate');
    });

    it('applies a palette, adopts the saved colours and reloads the preview', () => {
      const coral = component.themePresets.find((p) => p.name === 'Coral')!;
      const before = component.previewVersion;

      component.applyTheme(coral);

      const req = httpMock.expectOne(
        (r) => r.method === 'PUT' && r.url.endsWith('/pages/p1/colors'),
      );
      expect(req.request.body.colorVariables.length).toBe(8);
      expect(req.request.body.colorVariables).toContain({
        variable: '--accent-color1',
        value: '#a33a2b',
      });
      req.flush({
        ...PAGE,
        colorVariables: req.request.body.colorVariables.map((cv: any) => ({
          ...cv,
          original: '#000000',
        })),
      });

      expect(component.activeTheme).toBe('Coral');
      expect(component.applyingTheme).toBeNull();
      expect(component.previewVersion).toBe(before + 1);
    });

    it('does nothing when the palette is already active', () => {
      component.applyTheme(component.themePresets[0]);
      httpMock.expectNone((r) => r.url.endsWith('/colors'));
      expect(component.applyingTheme).toBeNull();
    });

    it('reports a failed apply and keeps the old palette', () => {
      component.applyTheme(component.themePresets[4]);
      httpMock
        .expectOne((r) => r.url.endsWith('/pages/p1/colors'))
        .flush({}, { status: 500, statusText: 'Server Error' });

      expect(component.themeError).toContain('Could not apply');
      expect(component.activeTheme).toBe('Slate');
    });
  });
});
