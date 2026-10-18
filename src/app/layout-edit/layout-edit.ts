import {
  afterNextRender,
  Component,
  HostListener,
  inject,
  Injector,
  OnInit,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DragDropModule, CdkDrag, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { concat, defer } from 'rxjs';
import { LayoutsService } from '../layouts.service';
import { TemplatesService } from '../templates.service';
import { ShareLinkService } from '../share-link.service';
import { slugify } from '../slugify';
import { SCRATCH_PAD_LIMIT } from '../scratch-pad';
import { OrgsService } from '../orgs.service';
import { TemplatePicker } from '../template-picker/template-picker';
import { OverflowMenu } from '../overflow-menu/overflow-menu';
import { CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import { SnippetDrawer, PALETTE_LIST_ID } from '../editor/snippet-drawer';
import { EditorPreview } from '../editor/editor-preview';
import { SaveTemplateDialog } from '../save-template-dialog/save-template-dialog';
import { SnippetsService } from '../snippets.service';
import { runtimeConfig, snippetThumbUrl } from '../runtime-config';
import { CreatorLabelsService } from '../creator-labels.service';
import {
  Layout,
  SnippetOverride,
  SnippetFilters,
  LicensingImage,
  Template,
} from '../models';

/**
 * Normalize a layout's nav/footer to a snippet reference.
 *
 * They used to be saved as bare id strings while every other snippet position
 * held a full abstract. Accepting both keeps pre-existing layouts working;
 * everything written from here on is an abstract.
 */
function snippetRefOf(value: unknown): Partial<SnippetOverride> | null {
  if (!value) return null;
  if (typeof value === 'string') return { id: value };
  if (typeof value === 'object' && (value as any).id) {
    return value as Partial<SnippetOverride>;
  }
  return null;
}

/** What the add-snippet drawer is adding to. */
type DrawerTarget = 'nav' | 'footer' | 'page';

// Library snippet types, as stored. Nav slots take `header` snippets.
const NAV_TYPE = 'header';
const FOOTER_TYPE = 'footer';

/** The persisted shape of one snippet position: id plus page-scoped overrides. */
function snippetAbstract(snippet: SnippetOverride) {
  return {
    id: snippet.id,
    cssOverride: snippet.cssOverride ?? '',
    htmlOverride: snippet.htmlOverride ?? {},
    jsOverride: snippet.jsOverride ?? '',
    textReplacementOverride: snippet.textReplacementOverride,
    imageReplacementOverride: snippet.imageReplacementOverride,
    aiCustomized: snippet.aiCustomized,
    aiImagesPopulated: snippet.aiImagesPopulated,
  };
}

@Component({
  selector: 'app-layout-edit',
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    TemplatePicker,
    SaveTemplateDialog,
    OverflowMenu,
    CdkMenu,
    CdkMenuItem,
    SnippetDrawer,
    EditorPreview,
  ],
  templateUrl: './layout-edit.html',
  // Shared with the page editor (src/app/editor/); the site-structure rail is
  // layout-only.
  styleUrls: [
    '../editor/editor-tokens.css',
    '../editor/editor-base.css',
    '../editor/editor-layout.css',
    './layout-edit-structure.css',
  ],
})
export class LayoutEdit implements OnInit {
  private route = inject(ActivatedRoute);
  readonly creators = inject(CreatorLabelsService);
  router = inject(Router);
  private layoutsService = inject(LayoutsService);
  private templatesService = inject(TemplatesService);
  private orgsService = inject(OrgsService);
  // Public: the template reads it to gate the slug field and preview the URL.
  readonly shareLinks = inject(ShareLinkService);

  /**
   * The URL the customer will actually get. Mirrors the server's normalisation
   * so the preview never disagrees with what gets saved.
   */
  get slugPreview(): string {
    const slug = slugify(this.details.slug);
    return slug
      ? `${this.shareLinks.base}/${slug}`
      : 'Leave blank to keep the default link.';
  }

  private snippetsService = inject(SnippetsService);
  private injector = inject(Injector);

  layout: Layout | null = null;
  layoutId: string | null = null;
  errorMessage: string | null = null;

  navbarSnippets: SnippetOverride[] = [];
  footerSnippets: SnippetOverride[] = [];
  availableSnippets: SnippetOverride[] = [];
  activeSubPageIndex = 0;
  viewUrl = runtimeConfig.viewUrl;
  // Bound in the template for every snippet thumbnail.
  snippetThumbUrl = snippetThumbUrl;
  customizing = false;

  // Library filter options, handed to the snippet drawer (which owns the
  // filtering and starring).
  filters: SnippetFilters = { types: [], tags: [] };

  // Editable name/siteName/description, seeded from the loaded layout. Kept
  // separate from `layout` so Cancel can discard edits and `detailsDirty` can
  // compare against what's actually saved.
  details = { name: '', siteName: '', description: '', slug: '' };
  savingDetails = false;
  detailsError = '';

  // Stock-image population. Kept separate from `customizing` so the two AI
  // actions can't be mistaken for one, and so re-running text never re-runs
  // images (each is its own OpenAI call server-side).
  findingImages = false;
  imagesError = '';
  imageDirection = '';
  showImageDirection = false;

  // Layout settings live in a collapsible card opened from the action bar.
  showDetails = false;

  // Live preview (right pane): the public rendered layout, opened on the
  // subpage that's open in the rail, with ez-view's own page switcher hidden
  // (the rail does that job). Bumping the version reloads it.
  previewVersion = 0;

  // The snippet library (snippets / templates / scratch pad) in the shared
  // drawer: an edge tab that slides in on hover, or pinned beside the preview.
  // `drawerTarget` says where a clicked snippet lands — the navbar and footer
  // slots replace, the open subpage appends. Dragging goes wherever it's
  // dropped.
  @ViewChild(SnippetDrawer) drawer?: SnippetDrawer;
  drawerPinned = false;
  drawerTarget: DrawerTarget = 'page';
  // The preview is in its own window, so the structure gets the room.
  previewPoppedOut = false;

  // Inline subpage rename. Null when no row is being renamed.
  renamingIndex: number | null = null;
  renameValue = '';
  subPageError: string | null = null;

  // Finalize drawer (readiness checklist + Shutterstock licensing hand-off).
  showFinalize = false;
  finalizeTab: 'checklist' | 'licensing' = 'checklist';
  licensing: LicensingImage[] = [];
  licensingLoading = false;
  licensingError = '';
  // One-click "license everything" link, built on demand (a Shutterstock
  // Collection created from the layout's images, affiliate-wrapped). Null until
  // generated; not persisted — an ez-background cron reaps the collection by age.
  collectionsEnabled = false;
  licenseAllUrl: string | null = null;
  generatingCollection = false;
  collectionError = '';
  downloading = false;
  downloadError = '';

  ngOnInit() {
    this.creators.load();
    this.layoutId = this.route.snapshot.paramMap.get('id');
    if (this.layoutId) {
      this.loadLayout();
    } else {
      this.errorMessage = 'No layout ID provided';
    }
  }

  // --- Live preview ---
  get previewSrc(): string {
    return (
      `${this.viewUrl}/view/layout/${this.layoutId}` +
      `?chrome=false&subpage=${this.activeSubPageIndex}`
    );
  }

  refreshPreview() {
    this.previewVersion += 1;
  }

  // --- Action bar: preview link ---
  /** Public rendered layout in ez-view (no auth needed). */
  openPreview() {
    if (this.layoutId)
      window.open(
        this.shareLinks.layoutUrl(this.layoutId, this.layout?.slug),
        '_blank',
      );
  }

  // --- Readiness (over subpage snippets) ---
  snippetReady(s: SnippetOverride): boolean {
    return s.aiCustomized === true && s.aiImagesPopulated === true;
  }
  needsWorkCount(): number {
    return this.layoutSnippets().filter((s) => !this.snippetReady(s)).length;
  }
  readinessState(): 'empty' | 'ready' | 'attention' {
    if (this.snippetCount() === 0) return 'empty';
    return this.needsWorkCount() === 0 ? 'ready' : 'attention';
  }
  readinessLabel(): string {
    switch (this.readinessState()) {
      case 'empty':
        return 'No snippets yet';
      case 'ready':
        return 'Ready to finalize';
      default:
        return `Almost ready · ${this.needsWorkCount()} to fix`;
    }
  }

  // --- Finalize drawer ---
  finalize() {
    this.showFinalize = true;
    this.finalizeTab = 'checklist';
    this.loadLicensing();
  }
  closeFinalize() {
    this.showFinalize = false;
  }
  setFinalizeTab(tab: 'checklist' | 'licensing') {
    this.finalizeTab = tab;
  }
  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.showFinalize) this.closeFinalize();
  }

  // --- Snippet library drawer ---
  /**
   * Open the drawer aimed at a slot. For the navbar and footer it shows only
   * their snippet type (see drawerLockedType).
   */
  openPalette(target: DrawerTarget, tab: 'snippets' | 'templates' | 'scratchpad' = 'snippets') {
    this.drawerTarget = target;
    this.templateError = null;
    this.scratchError = null;
    this.drawer?.open({ tab: target === 'page' ? tab : 'snippets' });
  }

  /** The navbar takes header snippets and the footer footer snippets, only. */
  get drawerLockedType(): string | null {
    return this.drawerTarget === 'nav' ? NAV_TYPE : this.drawerTarget === 'footer' ? FOOTER_TYPE : null;
  }

  /** Any close (or a hover-opened drawer sliding away) re-aims it at the page. */
  onDrawerClosed() {
    this.drawerTarget = 'page';
  }

  get drawerTitle(): string {
    switch (this.drawerTarget) {
      case 'nav':
        return this.navbarSnippets.length ? 'Change navbar' : 'Choose a navbar';
      case 'footer':
        return this.footerSnippets.length ? 'Change footer' : 'Choose a footer';
      default:
        return 'Add to ' + (this.activeSubPage?.name || 'this page');
    }
  }

  get drawerSub(): string {
    return this.drawerTarget === 'page'
      ? 'Click to add to the end, or drag onto any page'
      : 'Click a snippet to use it on every page';
  }

  /** A palette click: replace the nav/footer, or append to the open subpage. */
  pickSnippet(snippet: SnippetOverride) {
    if (this.drawerTarget === 'nav') {
      this.navbarSnippets = [{ ...snippet }];
      this.drawer?.close();
    } else if (this.drawerTarget === 'footer') {
      this.footerSnippets = [{ ...snippet }];
      this.drawer?.close();
    } else {
      const page = this.activeSubPage;
      if (!page) return;
      page.snippets.push({ ...snippet });
    }
    this.updateLayout();
  }

  removeNav() {
    this.navbarSnippets = [];
    this.updateLayout();
  }

  removeFooter() {
    this.footerSnippets = [];
    this.updateLayout();
  }

  /** Remove a snippet from the open subpage. Use park to keep its edits. */
  removeSnippet(index: number) {
    const page = this.activeSubPage;
    if (!page) return;
    page.snippets.splice(index, 1);
    this.updateLayout();
  }

  loadLicensing() {
    if (!this.layoutId) return;
    this.licensingLoading = true;
    this.licensingError = '';
    this.layoutsService.getLicensing(this.layoutId).subscribe({
      next: (data) => {
        this.licensing = data.images;
        this.collectionsEnabled = data.collectionsEnabled;
        this.licenseAllUrl = null;
        this.collectionError = '';
        this.licensingLoading = false;
      },
      error: (error) => {
        console.error('Error loading licensing:', error);
        this.licensingError = 'Could not load the image list. Please try again.';
        this.licensingLoading = false;
      },
    });
  }

  /**
   * Build a one-click "license all images" link on demand: the server creates a
   * Shutterstock Collection from this layout's images and returns its
   * affiliate-wrapped share URL. Nothing is stored — reaped by age server-side.
   */
  generateCollection() {
    if (!this.layoutId || this.generatingCollection) return;
    this.generatingCollection = true;
    this.collectionError = '';
    this.layoutsService.generateCollection(this.layoutId).subscribe({
      next: (res) => {
        this.licenseAllUrl = res.licenseAllUrl;
        this.generatingCollection = false;
      },
      error: (error) => {
        console.error('Error generating collection:', error);
        this.collectionError =
          'Could not build the license-all link. Please try again.';
        this.generatingCollection = false;
      },
    });
  }

  exportLicensingCsv() {
    const header = 'shutterstock_id,uses,preview_url\n';
    const rows = this.licensing
      .map((i) => `${i.shutterstockId},${i.uses},${i.previewUrl}`)
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.layout?.name || 'layout'}-image-licenses.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  downloadZip() {
    if (!this.layoutId || this.downloading) return;
    this.downloading = true;
    this.downloadError = '';
    this.layoutsService.downloadLayout(this.layoutId).subscribe({
      next: (blob) => {
        const slug =
          (this.layout?.name || 'layout')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'layout';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${slug}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        this.downloading = false;
      },
      error: (error) => {
        console.error('Error downloading layout:', error);
        this.downloadError = 'Could not build the download. Please try again.';
        this.downloading = false;
      },
    });
  }

  loadLayout() {
    if (!this.layoutId) return;

    this.layoutsService.getLayoutById(this.layoutId).subscribe({
      next: (data) => {
        this.layout = data;
        this.errorMessage = null;
        this.activeSubPageIndex = Math.min(
          this.activeSubPageIndex,
          Math.max((data.subPages?.length ?? 1) - 1, 0),
        );
        this.seedDetails();
        this.loadAvailableSnippets();
      },
      error: (error) => {
        console.error('Error loading layout:', error);
        console.error('Error details:', error.status, error.message);
        this.errorMessage = `Layout not found (ID: ${this.layoutId})`;
      },
    });
  }

  loadAvailableSnippets() {
    this.snippetsService.getAllSnippetSummary().subscribe({
      next: (data) => {
        this.availableSnippets = data;
        this.loadLayoutSnippets();
      },
      error: (error) => {
        console.error('Error loading available snippets:', error);
        console.error('Error details:', error.status, error.message);
      },
    });
    this.snippetsService.getFilters().subscribe({
      next: (data) => {
        this.filters = data;
      },
    });
  }

  // Templates. Two separate gestures in here: saving the whole layout as a
  // site template, and dropping a partial/page template (from the drawer's
  // Templates tab) into the subpage that's currently open.
  showSaveTemplate = false;
  templateMode: 'append' | 'replace' = 'append';
  templateError: string | null = null;

  // --- Scratch pad ---------------------------------------------------------
  //
  // Layout-wide, not per-subpage: parking a hero off Home and restoring it
  // onto About is the main thing the shelf buys here. Restores therefore land
  // on whichever subpage is currently open.
  scratchPad: SnippetOverride[] = [];
  scratchError: string | null = null;
  readonly scratchPadLimit = SCRATCH_PAD_LIMIT;

  get scratchPadFull(): boolean {
    return this.scratchPad.length >= this.scratchPadLimit;
  }

  /**
   * Build shelf rows like every other snippet row: library summary first for
   * display fields, stored abstract last so its customizations win.
   */
  private hydrateScratchPad() {
    this.scratchPad = (this.layout?.scratchPad ?? []).map((parked) => {
      const found = this.availableSnippets.find((s) => s.id === parked.id);
      return { ...(found ?? {}), ...parked } as SnippetOverride;
    });
  }

  /**
   * Adopt a layout returned by a scratch pad endpoint. The server's copy is the
   * truth about what moved; re-deriving from it keeps the subpage lists and the
   * shelf from drifting apart.
   */
  private applyServerLayout(data: Layout) {
    this.layout = data;
    this.scratchError = null;
    this.loadLayoutSnippets();
    this.refreshPreview();
  }

  private scratchFailed(err: any, fallback: string) {
    this.scratchError = err?.error?.message ?? fallback;
  }

  /** Pull a snippet off the active subpage and onto the shelf. */
  parkSnippet(index: number) {
    if (!this.layoutId || this.scratchPadFull) return;
    this.layoutsService
      .parkSnippet(this.layoutId, this.activeSubPageIndex, index)
      .subscribe({
        next: (data) => this.applyServerLayout(data),
        error: (err) => this.scratchFailed(err, 'Could not park that snippet.'),
      });
  }

  /** Put a parked snippet onto whichever subpage is open. */
  restoreSnippet(scratchIndex: number) {
    if (!this.layoutId) return;
    this.layoutsService
      .restoreSnippet(this.layoutId, scratchIndex, this.activeSubPageIndex)
      .subscribe({
        next: (data) => this.applyServerLayout(data),
        error: (err) =>
          this.scratchFailed(err, 'Could not restore that snippet.'),
      });
  }

  /** Destructive — the parked snippet's customizations go with it. */
  discardScratchSnippet(scratchIndex: number) {
    if (!this.layoutId) return;
    const name = this.scratchPad[scratchIndex]?.type || 'this snippet';
    if (!confirm(`Discard ${name}? Its customizations can't be recovered.`)) {
      return;
    }
    this.layoutsService
      .discardScratchSnippet(this.layoutId, scratchIndex)
      .subscribe({
        next: (data) => this.applyServerLayout(data),
        error: (err) =>
          this.scratchFailed(err, 'Could not discard that snippet.'),
      });
  }

  scratchDrop(event: CdkDragDrop<SnippetOverride[]>) {
    if (!this.layoutId || event.previousIndex === event.currentIndex) return;
    moveItemInArray(this.scratchPad, event.previousIndex, event.currentIndex);
    this.layoutsService
      .reorderScratchPad(this.layoutId, event.previousIndex, event.currentIndex)
      .subscribe({
        next: (data) => this.applyServerLayout(data),
        error: (err) => {
          this.scratchFailed(err, 'Could not reorder the scratch pad.');
          this.hydrateScratchPad();
        },
      });
  }

  /** Lands in the active subpage — that's the one the user is looking at. */
  applyTemplate(template: Template) {
    if (!this.layoutId) return;
    const current = this.getActiveSubPageSnippets();
    const mode = current.length ? this.templateMode : 'replace';

    this.templatesService
      .applyToLayout(this.layoutId, template.id, {
        mode,
        subPageIndex: this.activeSubPageIndex,
      })
      .subscribe({
        next: () => {
          this.drawer?.close();
          this.loadLayout();
          this.refreshPreview();
        },
        error: (err) => {
          this.templateError =
            err?.error?.message ?? 'Could not apply that template.';
        },
      });
  }

  deleteTemplate(template: Template, picker: TemplatePicker) {
    this.templatesService.deleteTemplate(template.id).subscribe({
      next: () => picker.load(),
      error: () => (this.templateError = 'Could not delete that template.'),
    });
  }

  /** Ids only — a site template is the shell, never the content in it. */
  get templateNavId(): string | undefined {
    return this.navbarSnippets[0]?.id;
  }

  get templateFooterId(): string | undefined {
    return this.footerSnippets[0]?.id;
  }

  get templateSubPages(): Array<{ name: string; snippetIds: string[] }> {
    return (this.layout?.subPages ?? []).map((sp) => ({
      name: sp.name,
      snippetIds: (sp.snippets ?? []).map((s) => s.id),
    }));
  }

  openSaveTemplate() {
    this.showSaveTemplate = true;
  }

  onTemplateSaved() {
    this.showSaveTemplate = false;
  }

  loadLayoutSnippets() {
    if (!this.layout || !this.availableSnippets.length) {
      return;
    }

    // Load navbar snippet. Older layouts stored nav/footer as a bare id string;
    // they're snippet abstracts now, like subpage snippets and page snippets
    // have always been. Read both so a layout saved before the change still
    // opens, and merge the ref's overrides over the library snippet so AI text
    // and image customization on the nav/footer survives a reload.
    const navRef = snippetRefOf(this.layout.nav);
    this.navbarSnippets = [];
    if (navRef) {
      // Keep the row even if the library lookup misses — see the note on the
      // subPage mapping below.
      const navbarSnippet = this.availableSnippets.find((s) => s.id === navRef.id);
      this.navbarSnippets.push({
        ...(navbarSnippet ?? {}),
        ...navRef,
      } as SnippetOverride);
    }

    const footerRef = snippetRefOf(this.layout.footer);
    this.footerSnippets = [];
    if (footerRef) {
      const footerSnippet = this.availableSnippets.find((s) => s.id === footerRef.id);
      this.footerSnippets.push({
        ...(footerSnippet ?? {}),
        ...footerRef,
      } as SnippetOverride);
    }

    // Layouts created before the server started seeding a Home subpage can
    // have none. Save one rather than showing an unsaved placeholder — every
    // subpage endpoint addresses subpages by position, so a placeholder the
    // server doesn't have makes the first template insert or restore fail.
    let seededHome = false;
    if (!this.layout.subPages || this.layout.subPages.length === 0) {
      this.layout.subPages = [{ name: 'Home', snippets: [] }];
      seededHome = true;
    }

    // Load subPage snippets
    this.layout.subPages = this.layout.subPages.map((subPage) => ({
      ...subPage,
      // Never drop a stored snippet because the library lookup missed: this
      // list is what gets persisted back, so filtering a row out would delete
      // that snippet from the layout on the next save. Fall back to the stored
      // ref alone — a row missing its display fields beats silent data loss.
      snippets: subPage.snippets.map(
        (snippetRef) =>
          ({
            ...(this.availableSnippets.find((s) => s.id === snippetRef.id) ?? {}),
            ...snippetRef,
          }) as SnippetOverride,
      ),
    }));

    this.hydrateScratchPad();
    if (seededHome) this.updateLayout();
  }

  get activeSubPage() {
    return this.layout?.subPages?.[this.activeSubPageIndex] ?? null;
  }

  getActiveSubPageSnippets(): SnippetOverride[] {
    if (!this.layout?.subPages?.[this.activeSubPageIndex]) {
      return [];
    }
    return this.layout.subPages[this.activeSubPageIndex].snippets || [];
  }

  setActiveSubPage(index: number) {
    if (index === this.activeSubPageIndex) return;
    this.activeSubPageIndex = index;
    this.cancelRename();
    // previewSrc carries the subpage index, so the preview follows on its own.
  }

  // --- Drag and drop -------------------------------------------------------
  //
  // Targets: the navbar and footer slots (library snippets only), the open
  // subpage's list (insert from the library, or reorder), and every page row
  // (drop a library snippet or one from the open page to append it there).

  readonly openListId = 'subpage-list';
  // Page rows are drop targets only; nothing is ever listed in them.
  readonly noSnippets: SnippetOverride[] = [];

  pageDropId(index: number): string {
    return `page-drop-${index}`;
  }

  /** Where library tiles can go. */
  get paletteTargets(): string[] {
    return [
      'navbar-slot',
      'footer-slot',
      this.openListId,
      ...(this.layout?.subPages ?? []).map((_, i) => this.pageDropId(i)),
    ];
  }

  /** Where the open page's snippets can go besides reordering: other pages. */
  get otherPageTargets(): string[] {
    return (this.layout?.subPages ?? [])
      .map((_, i) => i)
      .filter((i) => i !== this.activeSubPageIndex)
      .map((i) => this.pageDropId(i));
  }

  // The navbar and footer slots take only library snippets of their own type.
  // A wrong-type drag doesn't highlight the slot and won't drop there.
  readonly navAccepts = (drag: CdkDrag<SnippetOverride>) =>
    drag.dropContainer.id === PALETTE_LIST_ID && drag.data?.type === NAV_TYPE;
  readonly footerAccepts = (drag: CdkDrag<SnippetOverride>) =>
    drag.dropContainer.id === PALETTE_LIST_ID && drag.data?.type === FOOTER_TYPE;

  /** The open subpage's list: insert from the library, or reorder. */
  dropOnOpenPage(event: CdkDragDrop<SnippetOverride[]>) {
    const page = this.activeSubPage;
    if (!page) return;
    if (event.previousContainer.id === PALETTE_LIST_ID) {
      page.snippets.splice(event.currentIndex, 0, { ...(event.item.data as SnippetOverride) });
    } else {
      if (event.previousIndex === event.currentIndex) return;
      moveItemInArray(page.snippets, event.previousIndex, event.currentIndex);
    }
    this.updateLayout();
  }

  /**
   * A page row: append there. From the library that's a copy; from the open
   * page it's a move, and the snippet keeps its AI text and images (the server
   * merges customizations by snippet id).
   */
  dropOnPageRow(event: CdkDragDrop<SnippetOverride[]>, index: number) {
    const target = this.layout?.subPages[index];
    if (!target) return;
    if (event.previousContainer.id === PALETTE_LIST_ID) {
      target.snippets.push({ ...(event.item.data as SnippetOverride) });
    } else if (event.previousContainer.id === this.openListId && index !== this.activeSubPageIndex) {
      const source = this.activeSubPage;
      if (!source) return;
      const [moved] = source.snippets.splice(event.previousIndex, 1);
      if (!moved) return;
      target.snippets.push(moved);
    } else {
      return;
    }
    this.updateLayout();
  }

  /** Navbar/footer slot: a library snippet of its type replaces what's there. */
  dropOnSlot(event: CdkDragDrop<SnippetOverride[]>, slot: 'nav' | 'footer') {
    if (event.previousContainer.id !== PALETTE_LIST_ID) return;
    const snippet = { ...(event.item.data as SnippetOverride) };
    // The enter predicates already refuse other types; this is the backstop.
    if (snippet.type !== (slot === 'nav' ? NAV_TYPE : FOOTER_TYPE)) return;
    if (slot === 'nav') this.navbarSnippets = [snippet];
    else this.footerSnippets = [snippet];
    this.updateLayout();
  }

  // --- Subpage management ---------------------------------------------------

  /** Add a subpage, open it, and drop straight into naming it. */
  addSubPage() {
    if (!this.layout) return;
    const names = new Set(this.layout.subPages.map((sp) => sp.name));
    let name = 'New page';
    for (let n = 2; names.has(name); n++) name = `New page ${n}`;
    this.layout.subPages.push({ name, snippets: [] });
    this.activeSubPageIndex = this.layout.subPages.length - 1;
    this.updateLayout();
    this.startRename(this.activeSubPageIndex);
  }

  startRename(index: number) {
    this.renamingIndex = index;
    this.renameValue = this.layout?.subPages[index]?.name ?? '';
    // The input doesn't exist until the next render (change detection is
    // coalesced to the next frame, so a setTimeout would run too early).
    afterNextRender(
      () => {
        const input = document.getElementById(`subpage-rename-${index}`) as HTMLInputElement | null;
        input?.focus();
        input?.select();
      },
      { injector: this.injector },
    );
  }

  commitRename() {
    if (this.renamingIndex === null || !this.layout) return;
    const page = this.layout.subPages[this.renamingIndex];
    const name = this.renameValue.trim();
    this.renamingIndex = null;
    if (!page || !name || name === page.name) return;
    page.name = name;
    this.updateLayout();
  }

  cancelRename() {
    this.renamingIndex = null;
  }

  moveSubPage(index: number, delta: -1 | 1) {
    if (!this.layout) return;
    const to = index + delta;
    if (to < 0 || to >= this.layout.subPages.length) return;
    moveItemInArray(this.layout.subPages, index, to);
    // Keep the same page open wherever it moved to.
    if (this.activeSubPageIndex === index) this.activeSubPageIndex = to;
    else if (this.activeSubPageIndex === to) this.activeSubPageIndex = index;
    this.updateLayout();
  }

  /**
   * Delete a subpage. Its snippets go to the scratch pad when there's room —
   * parking keeps their AI text and images — otherwise they're deleted with
   * it, and the confirm says which. The last subpage can't be deleted.
   */
  deleteSubPage(index: number) {
    if (!this.layout || !this.layoutId || this.layout.subPages.length <= 1) return;
    const page = this.layout.subPages[index];
    const count = page.snippets.length;
    const room = this.scratchPadLimit - this.scratchPad.length;
    const park = count > 0 && count <= room;

    const plural = count === 1 ? 'snippet' : 'snippets';
    const message = !count
      ? `Delete “${page.name}”?`
      : park
        ? `Delete “${page.name}”? Its ${count} ${plural} will move to the scratch pad.`
        : `Delete “${page.name}” and its ${count} ${plural}? The scratch pad doesn't have room for them, so their customizations will be lost.`;
    if (!confirm(message)) return;

    const layoutId = this.layoutId;
    // Park from the front, one at a time: each park shifts the rest up, and
    // the server is the source of truth for both lists between calls.
    const parks = park
      ? Array.from({ length: count }, () =>
          defer(() => this.layoutsService.parkSnippet(layoutId, index, 0)),
        )
      : [];

    this.subPageError = null;
    concat(...parks).subscribe({
      next: (data) => this.applyServerLayout(data),
      error: (err) =>
        (this.subPageError = err?.error?.message ?? 'Could not move those snippets.'),
      complete: () => {
        if (!this.layout) return;
        this.layout.subPages.splice(index, 1);
        if (this.activeSubPageIndex >= this.layout.subPages.length) {
          this.activeSubPageIndex = this.layout.subPages.length - 1;
        } else if (this.activeSubPageIndex > index) {
          this.activeSubPageIndex -= 1;
        }
        this.updateLayout();
      },
    });
  }

  updateLayout() {
    if (!this.layoutId || !this.layout) return;

    const updateData: Partial<Layout> = {
      // Abstracts, not bare ids: the API guards every nav/footer read on
      // `nav?.id`, so a string meant AI text customization, image population and
      // the licensing collector all silently skipped the navbar and footer.
      nav: this.navbarSnippets.length ? snippetAbstract(this.navbarSnippets[0]) : null,
      footer: this.footerSnippets.length ? snippetAbstract(this.footerSnippets[0]) : null,
      subPages:
        this.layout.subPages?.map((subPage) => ({
          name: subPage.name,
          // Carry page-scoped customizations through on every list edit, so
          // dragging a snippet into a subpage doesn't blank the AI text/image
          // overrides on the others. The server preserves these defensively
          // too; sending them keeps the payload honest.
          snippets: subPage.snippets.map((snippet) => ({
            id: snippet.id,
            cssOverride: snippet.cssOverride ?? '',
            htmlOverride: snippet.htmlOverride ?? {},
            jsOverride: snippet.jsOverride ?? '',
            textReplacementOverride: snippet.textReplacementOverride,
            imageReplacementOverride: snippet.imageReplacementOverride,
            aiCustomized: snippet.aiCustomized,
            aiImagesPopulated: snippet.aiImagesPopulated,
          })),
        })) || [],
    };

    this.layoutsService.updateLayout(this.layoutId, updateData).subscribe({
      // The response holds bare abstracts; re-hydrate so rows keep their
      // display fields, then reload the preview.
      next: (data) => this.applyServerLayout(data),
      error: (error) => {
        console.error('Error updating layout:', error);
        this.subPageError = 'Could not save that change. Please refresh and try again.';
      },
    });
  }

  // The customizable snippets in a layout are the subpage snippets (across all
  // subpages). nav/footer are stored as bare id strings, carry no flags, and are
  // skipped by the server's customize, so they're intentionally excluded here.
  private layoutSnippets(): SnippetOverride[] {
    const out: SnippetOverride[] = [];
    for (const sp of this.layout?.subPages ?? []) {
      out.push(...(sp.snippets ?? []));
    }
    return out;
  }
  snippetCount(): number {
    return this.layoutSnippets().length;
  }
  textCustomizedCount(): number {
    return this.layoutSnippets().filter((s) => s.aiCustomized === true).length;
  }
  textMissingCount(): number {
    return this.snippetCount() - this.textCustomizedCount();
  }
  isAiCustomized(): boolean {
    return this.snippetCount() > 0 && this.textMissingCount() === 0;
  }

  /**
   * Run AI text customization. onlyMissing customizes just the snippets that
   * were never customized (e.g. ones added after an earlier run) and leaves the
   * others untouched; omit it to re-customize the whole layout.
   */
  customize(onlyMissing = false) {
    if (!this.layoutId || this.customizing) return;
    this.customizing = true;
    this.layoutsService.customizeLayout(this.layoutId, onlyMissing).subscribe({
      next: (data) => {
        this.layout = data;
        this.customizing = false;
      },
      error: (error) => {
        console.error('Error customizing layout:', error);
        this.customizing = false;
      },
    });
  }

  trackBySnippetId(index: number, snippet: SnippetOverride): string {
    return snippet.id || index.toString();
  }

  trackBySubPageIndex(index: number): number {
    return index;
  }

  // Image population status, over the same subpage snippets as the text counts.
  imagesPopulatedCount(): number {
    return this.layoutSnippets().filter((s) => s.aiImagesPopulated === true)
      .length;
  }
  imagesMissingCount(): number {
    return this.snippetCount() - this.imagesPopulatedCount();
  }
  /** True once every subpage snippet has been through image population. */
  hasAiImages(): boolean {
    return this.snippetCount() > 0 && this.imagesMissingCount() === 0;
  }

  /**
   * Ask the server to fill this layout's image slots with stock photos.
   * onlyMissing targets just the not-yet-populated snippets (leaving the rest
   * alone); replaceExisting redoes every slot on the targeted snippets.
   */
  findImages(opts: { onlyMissing?: boolean; replaceExisting?: boolean } = {}) {
    if (!this.layoutId || this.findingImages) return;

    this.findingImages = true;
    this.imagesError = '';

    this.layoutsService
      .customizeLayoutImages(this.layoutId, {
        direction: this.imageDirection.trim() || undefined,
        onlyMissing: opts.onlyMissing,
        replaceExisting: opts.replaceExisting,
      })
      .subscribe({
        next: (data) => {
          this.layout = data;
          this.findingImages = false;
        },
        error: (error) => {
          this.findingImages = false;
          // 401 here means the Shutterstock token is missing server-side, which
          // is a config problem rather than anything the user can fix.
          this.imagesError =
            error?.status === 401
              ? 'Image search is not configured. Check the server settings.'
              : 'Could not find images. Please try again.';
          console.error('Error finding images:', error);
        },
      });
  }

  private seedDetails() {
    this.details = {
      name: this.layout?.name ?? '',
      siteName: this.layout?.siteName ?? '',
      description: this.layout?.description ?? '',
      slug: this.layout?.slug ?? '',
    };
  }

  get detailsDirty(): boolean {
    if (!this.layout) return false;
    return (
      this.details.name.trim() !== (this.layout.name ?? '') ||
      this.details.siteName.trim() !== (this.layout.siteName ?? '') ||
      this.details.description.trim() !== (this.layout.description ?? '') ||
      this.details.slug.trim() !== (this.layout.slug ?? '')
    );
  }

  resetDetails() {
    this.seedDetails();
    this.detailsError = '';
  }

  saveDetails() {
    if (!this.layoutId || this.savingDetails || !this.detailsDirty) return;
    if (!this.details.name.trim()) {
      this.detailsError = 'Name is required.';
      return;
    }

    this.savingDetails = true;
    this.detailsError = '';

    this.layoutsService
      .updateLayoutDetails(this.layoutId, {
        name: this.details.name.trim(),
        siteName: this.details.siteName.trim(),
        description: this.details.description.trim(),
        slug: this.details.slug.trim(),
      })
      .subscribe({
        next: (updated) => {
          this.layout = updated;
          // Re-seed from the server's response so `detailsDirty` compares
          // against what was actually persisted (e.g. after trimming).
          this.seedDetails();
          this.savingDetails = false;
        },
        error: (error) => {
          this.savingDetails = false;
          // Slug rejections carry a specific message worth showing.
          this.detailsError =
            error?.error?.message ?? 'Could not save changes. Please try again.';
          console.error('Error updating layout details:', error);
        },
      });
  }
}
