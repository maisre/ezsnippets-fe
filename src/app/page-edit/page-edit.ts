import { Component, DestroyRef, inject, OnInit, HostListener, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  DragDropModule,
  CdkDragDrop,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { PagesService } from '../pages.service';
import { SnippetsService } from '../snippets.service';
import { runtimeConfig, snippetThumbUrl } from '../runtime-config';
import {
  Page,
  SnippetOverride,
  SnippetFilters,
  LicensingImage,
  Template,
  ImageFillMode,
  ImageFillSummary,
} from '../models';
import { TemplatePicker } from '../template-picker/template-picker';
import { SaveTemplateDialog } from '../save-template-dialog/save-template-dialog';
import { TemplatesService } from '../templates.service';
import { ShareLinkService } from '../share-link.service';
import { slugify } from '../slugify';
import { SCRATCH_PAD_LIMIT } from '../scratch-pad';
import { OrgsService } from '../orgs.service';
import { CreatorLabelsService } from '../creator-labels.service';
import { SnippetDrawer, PALETTE_LIST_ID } from '../editor/snippet-drawer';
import { EditorPreview } from '../editor/editor-preview';
import {
  hasCustomText,
  hasImageSlots,
  imageSlotStatus,
  imageTokensOf,
  imagesDone,
} from '../editor/readiness';
import { FeedbackService } from '../feedback/feedback.service';
import { THEME_PRESETS, ThemePreset, activeThemePreset } from '../editor/theme-presets';

// Shown beside an AI action that was not run because the brief it reads could
// not be saved first.
const BRIEF_SAVE_FAILED = 'Your site brief could not be saved, so nothing was run. Try again.';

@Component({
  selector: 'app-page-edit',
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    TemplatePicker,
    SaveTemplateDialog,
    SnippetDrawer,
    EditorPreview,
  ],
  templateUrl: './page-edit.html',
  // Everything is shared with the layout editor; see src/app/editor/.
  styleUrls: [
    '../editor/editor-tokens.css',
    '../editor/editor-base.css',
    '../editor/editor-layout.css',
    '../editor/editor-brief.css',
  ],
})
export class PageEdit implements OnInit {
  private route = inject(ActivatedRoute);
  readonly creators = inject(CreatorLabelsService);
  router = inject(Router);
  private pagesService = inject(PagesService);
  private snippetsService = inject(SnippetsService);
  private templatesService = inject(TemplatesService);
  private orgsService = inject(OrgsService);
  // Public: the template reads it to gate the slug field and preview the URL.
  readonly shareLinks = inject(ShareLinkService);
  private feedback = inject(FeedbackService);

  constructor() {
    // Feedback sent while this editor is open carries the page and its
    // snippets, in order, so a report can be reproduced.
    const unregister = this.feedback.registerContext(() => ({
      page: this.pageId ?? undefined,
      snippets: this.pageSnippets.map((s) => ({ id: s.id, type: s.type })),
    }));
    inject(DestroyRef).onDestroy(unregister);
  }

  /** Open feedback already pointed at this snippet. */
  flagSnippet(snippet: SnippetOverride) {
    this.feedback.open({ id: snippet.id, type: snippet.type });
  }

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


  page: Page | null = null;
  pageId: string | null = null;
  loadError: string | null = null;
  pageSnippets: SnippetOverride[] = [];
  /**
   * Snippets parked off the page while deciding on look and feel. Hydrated the
   * same way as pageSnippets — the stored abstract carries the customizations,
   * the library summary supplies display fields for the thumbnail.
   */
  scratchPad: SnippetOverride[] = [];
  scratchError: string | null = null;
  readonly scratchPadLimit = SCRATCH_PAD_LIMIT;
  availableSnippets: SnippetOverride[] = [];
  // Library summary by id; the readiness checks read image slots from it.
  private library = new Map<string, SnippetOverride>();
  viewUrl = runtimeConfig.viewUrl;
  // Bound in the template for every snippet thumbnail.
  snippetThumbUrl = snippetThumbUrl;
  customizing = false;

  // Library filter options, loaded here and handed to the snippet drawer
  // (which owns the filtering and starring).
  filters: SnippetFilters = { types: [], tags: [] };

  // Editable name/siteName/description, seeded from the loaded page. Kept
  // separate from `page` so Cancel can discard edits and `detailsDirty` can
  // compare against what's actually saved.
  details = { name: '', siteName: '', description: '', slug: '' };
  savingDetails = false;
  detailsError = '';

  // Page settings (name/siteName/description) live in a collapsible card now
  // that the name shows in the action bar; the bar's rename button opens it.
  showDetails = false;

  // Stock-image population. Kept separate from `customizing` so the two AI
  // actions can't be mistaken for one, and so re-running text never re-runs
  // images (each is its own OpenAI call server-side).
  findingImages = false;
  customizeError = '';
  // Phone-width notice (CSS hides it on larger screens); per visit.
  smallScreenNoticeDismissed = false;
  imagesError = '';
  imagesNotice = '';
  // What the last copy run did, shown with a link to go and read it.
  copyNotice = '';
  // "Rewrite all" and "Redo all images" overwrite hand edits, so each asks
  // first — inline, in the row, rather than with a native confirm().
  confirming: 'copy' | 'images' | null = null;
  imageDirection = '';
  // Quick fill (default): one stock search for the keywords, no AI.
  // Smart fill: AI writes a search per slot; the server falls back to quick
  // fill if AI is unavailable.
  imageMode: ImageFillMode = 'quick';
  imageKeywords = '';
  keywordSuggestions: string[] = [];
  suggestingKeywords = false;
  keywordsError = '';

  // Live preview (right pane): the shared preview component reloads whenever
  // this version moves, which every edit does via refreshPreview().
  previewVersion = 0;

  // The snippet library (snippets / templates / scratch pad) lives in the
  // shared drawer: an edge tab that slides in on hover, or pinned beside the
  // preview. Templates: partials and page templates together — from the
  // user's side both are "drop in a chunk I like".
  @ViewChild(SnippetDrawer) drawer?: SnippetDrawer;
  drawerPinned = false;
  readonly paletteTargets = ['page-snippets'];
  // The preview is in its own window, so the structure gets the room.
  previewPoppedOut = false;
  // Applying to a page that already has snippets appends by default; replacing
  // is destructive and has no undo, so it stays an explicit choice.
  templateMode: 'append' | 'replace' = 'append';
  templateError: string | null = null;

  // Save-as-template modal.
  showSaveTemplate = false;

  applyTemplate(template: Template) {
    if (!this.pageId) return;
    const mode = this.pageSnippets.length ? this.templateMode : 'replace';

    this.templatesService.applyToPage(this.pageId, template.id, mode).subscribe({
      next: () => {
        this.drawer?.close();
        this.loadPage();
        // loadPage() only repopulates the snippet list; the iframe keeps its
        // old src until the version counter moves, so bump it explicitly.
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

  /** Ids only — the dialog never sees page content, by design. */
  get currentSnippetIds(): string[] {
    return this.pageSnippets.map((s) => s.id);
  }

  openSaveTemplate() {
    this.showSaveTemplate = true;
  }

  onTemplateSaved() {
    this.showSaveTemplate = false;
  }

  // Finalize drawer (readiness checklist + Shutterstock licensing hand-off).
  showFinalize = false;
  finalizeTab: 'checklist' | 'licensing' = 'checklist';
  licensing: LicensingImage[] = [];
  licensingLoading = false;
  licensingError = '';
  // One-click "license everything" link, built on demand (a Shutterstock
  // Collection created from the page's images, affiliate-wrapped). Null until
  // the user generates it; not persisted — an ez-background cron reaps the
  // collection by age.
  collectionsEnabled = false;
  licenseAllUrl: string | null = null;
  generatingCollection = false;
  collectionError = '';
  downloading = false;
  downloadError = '';

  ngOnInit() {
    this.creators.load();
    this.pageId = this.route.snapshot.paramMap.get('id');
    if (this.pageId) {
      this.loadPage();
    }
  }

  /** The public render the preview shows. */
  get previewSrc(): string {
    return `${this.viewUrl}/view/page/${this.pageId}`;
  }

  /** Reload the preview (after any edit that changes what renders). */
  refreshPreview() {
    this.previewVersion += 1;
  }

  /** Open the library from the "Add snippet" button. */
  openPalette() {
    this.templateError = null;
    this.scratchError = null;
    this.drawer?.open({ tab: 'snippets' });
  }

  /**
   * Coming back from the content editor tab: re-read the page. The rows hold
   * each snippet's text/image overrides and send them back on the next list
   * change, so stale copies would overwrite what was just edited. Skipped
   * while a list save is in flight — its response is the fresher copy.
   */
  @HostListener('window:focus')
  onWindowFocus() {
    // Also skipped after a failed save: the screen is ahead of the server.
    if (!this.pageId || !this.page || this.savingSnippets || this.saveError) return;
    this.pagesService.getPageById(this.pageId).subscribe({
      next: (data) => {
        if (this.savingSnippets) return;
        this.page = data;
        this.loadPageSnippets();
        this.refreshPreview();
      },
      error: () => {
        // Keep what's on screen; the next edit reports its own failure.
      },
    });
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.confirming = null;
    if (this.showFinalize) this.closeFinalize();
  }

  /** Append a snippet from the palette, persist, and refresh the preview. */
  addSnippetToPage(snippet: SnippetOverride) {
    this.pageSnippets.push({ ...snippet });
    this.updatePageSnippets();
  }

  /** Remove a snippet from the page by position, persist, and refresh. */
  removeSnippet(index: number) {
    this.pageSnippets.splice(index, 1);
    this.updatePageSnippets();
  }

  loadPage() {
    if (!this.pageId) return;

    this.pagesService.getPageById(this.pageId).subscribe({
      next: (data) => {
        this.page = data;
        this.seedDetails();
        this.loadAvailableSnippets();
      },
      error: (error) => {
        console.error('Error loading page:', error);
        console.error('Error details:', error.status, error.message);
        // Only matters before the first load; a failed reload keeps the editor.
        if (!this.page) {
          this.loadError =
            error?.status === 404 || error?.status === 403
              ? 'This page doesn\'t exist or you don\'t have access to it.'
              : 'Could not load this page. Check your connection and try again.';
        }
      },
    });
  }

  loadAvailableSnippets() {
    this.snippetsService.getAllSnippetSummary().subscribe({
      next: (data) => {
        this.availableSnippets = data;
        this.library = new Map(data.map((s) => [s.id, s]));
        this.loadPageSnippets();
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

  loadPageSnippets() {
    if (!this.page?.snippets || !this.availableSnippets.length) {
      return;
    }

    // Clear existing page snippets
    this.pageSnippets = [];

    // Go through the snippets list on this.page and find corresponding snippets
    this.page.snippets.forEach((pageSnippet) => {
      // Find the corresponding snippet in availableSnippets
      const foundSnippet = this.availableSnippets.find((snippet) => snippet.id === pageSnippet.id);

      // Never drop a stored snippet just because the library lookup missed.
      // This list is what updatePageSnippets() persists, so skipping a row
      // would delete that snippet from the page the next time the user
      // reordered or removed anything. Fall back to the stored snippet alone —
      // the row renders without its library display fields, which is a far
      // better failure than silent data loss.
      //
      // The library summary supplies display fields (type/tags) for the
      // palette; the page's stored snippet supplies the page-scoped
      // customizations (text/image overrides, AI flags). Spread the stored
      // snippet last so its customizations survive — otherwise editing the
      // snippet list would round-trip a customization-free copy and wipe it.
      this.pageSnippets.push({
        ...(foundSnippet ?? {}),
        ...pageSnippet,
      } as SnippetOverride);
    });

    this.hydrateScratchPad();
  }

  /**
   * Build the shelf rows the same way as the page rows: library summary first
   * for display fields, stored abstract last so its customizations win. A
   * parked snippet whose library entry has gone missing still renders, for the
   * same reason a page one does — dropping the row would be data loss.
   */
  private hydrateScratchPad() {
    this.scratchPad = (this.page?.scratchPad ?? []).map((parked) => {
      const found = this.availableSnippets.find((s) => s.id === parked.id);
      return { ...(found ?? {}), ...parked } as SnippetOverride;
    });
  }

  /**
   * Adopt a page returned by a scratch pad endpoint.
   *
   * The server sends the whole page back, and it — not the local arrays — is
   * the truth about what moved where. Re-hydrating from it is what keeps a
   * failed or racing request from leaving the two lists disagreeing.
   */
  private applyServerPage(data: Page, refreshPreview: boolean) {
    this.page = data;
    this.scratchError = null;
    this.loadPageSnippets();
    if (refreshPreview) this.refreshPreview();
  }

  private scratchFailed(err: any, fallback: string) {
    this.scratchError = err?.error?.message ?? fallback;
  }

  // --- Scratch pad ---------------------------------------------------------

  get scratchPadFull(): boolean {
    return this.scratchPad.length >= this.scratchPadLimit;
  }

  /** Pull a snippet off the page and onto the shelf. */
  parkSnippet(index: number) {
    if (!this.pageId || this.scratchPadFull) return;
    this.pagesService.parkSnippet(this.pageId, index).subscribe({
      next: (data) => this.applyServerPage(data, true),
      error: (err) => this.scratchFailed(err, 'Could not park that snippet.'),
    });
  }

  /** Put a parked snippet back on the page (appended). */
  restoreSnippet(scratchIndex: number) {
    if (!this.pageId) return;
    this.pagesService.restoreSnippet(this.pageId, scratchIndex).subscribe({
      next: (data) => this.applyServerPage(data, true),
      error: (err) => this.scratchFailed(err, 'Could not restore that snippet.'),
    });
  }

  /**
   * Throw a parked snippet away. Its text and image customizations go with it
   * and there is nowhere to get them back from, hence the confirm.
   */
  discardScratchSnippet(scratchIndex: number) {
    if (!this.pageId) return;
    const name = this.scratchPad[scratchIndex]?.type || 'this snippet';
    if (!confirm(`Discard ${name}? Its customizations can't be recovered.`)) {
      return;
    }
    this.pagesService.discardScratchSnippet(this.pageId, scratchIndex).subscribe({
      // Nothing rendered changed, so the preview is left alone.
      next: (data) => this.applyServerPage(data, false),
      error: (err) => this.scratchFailed(err, 'Could not discard that snippet.'),
    });
  }

  /** Reorder within the shelf. */
  scratchDrop(event: CdkDragDrop<SnippetOverride[]>) {
    if (!this.pageId || event.previousIndex === event.currentIndex) return;
    // Move locally first so the drag doesn't visibly snap back while the
    // request is in flight; the server response re-hydrates either way.
    moveItemInArray(this.scratchPad, event.previousIndex, event.currentIndex);
    this.pagesService
      .reorderScratchPad(this.pageId, event.previousIndex, event.currentIndex)
      .subscribe({
        next: (data) => this.applyServerPage(data, false),
        error: (err) => {
          this.scratchFailed(err, 'Could not reorder the scratch pad.');
          this.hydrateScratchPad();
        },
      });
  }

  /**
   * A drop on the page structure list: a snippet dragged in from the library
   * is inserted (as a copy — the library keeps it) where it was dropped;
   * otherwise it's a reorder within the list.
   */
  drop(event: CdkDragDrop<SnippetOverride[]>) {
    if (event.previousContainer.id === PALETTE_LIST_ID) {
      this.pageSnippets.splice(event.currentIndex, 0, { ...(event.item.data as SnippetOverride) });
    } else {
      if (event.previousIndex === event.currentIndex) return;
      moveItemInArray(this.pageSnippets, event.previousIndex, event.currentIndex);
    }
    this.updatePageSnippets();
  }

  // Snippet-list saves go out one at a time. Each PUT sends the whole list, so
  // two in flight can land out of order and the older list wins — a removed
  // snippet comes back. Edits made mid-save are folded into one follow-up.
  private savingSnippets = false;
  private snippetSaveQueued = false;
  saveError: string | null = null;

  updatePageSnippets() {
    if (!this.pageId) return;
    if (this.savingSnippets) {
      this.snippetSaveQueued = true;
      return;
    }
    this.savingSnippets = true;

    // Carry the page-scoped customizations through on every list edit. The
    // server also preserves these defensively, but sending them keeps the
    // payload honest and avoids re-submitting blanked overrides.
    const snippets = this.pageSnippets.map((snippet) => ({
      id: snippet.id,
      cssOverride: snippet.cssOverride ?? '',
      jsOverride: snippet.jsOverride ?? '',
      htmlOverride: snippet.htmlOverride ?? '',
      textReplacementOverride: snippet.textReplacementOverride,
      imageReplacementOverride: snippet.imageReplacementOverride,
      aiCustomized: snippet.aiCustomized,
      aiImagesPopulated: snippet.aiImagesPopulated,
    }));
    this.pagesService.updatePageSnippets(this.pageId, snippets).subscribe({
      next: (data) => {
        this.savingSnippets = false;
        this.saveError = null;
        if (this.snippetSaveQueued) {
          this.snippetSaveQueued = false;
          this.updatePageSnippets();
          return;
        }
        this.page = data;
        this.refreshPreview();
      },
      error: (error) => {
        console.error('Error updating page snippets:', error);
        this.savingSnippets = false;
        this.snippetSaveQueued = false;
        // The list on screen is now ahead of the server. Say so, and let Retry
        // resend it — reloading would throw the change away.
        this.saveError = 'Your last change wasn\'t saved.';
      },
    });
  }

  // --- Text status (per snippet: AI-customized or edited by hand) ---
  snippetCount(): number {
    return this.page?.snippets?.length ?? 0;
  }
  textCustomizedCount(): number {
    return (this.page?.snippets ?? []).filter((s) => hasCustomText(s)).length;
  }
  textMissingCount(): number {
    return this.snippetCount() - this.textCustomizedCount();
  }
  isAiCustomized(): boolean {
    return this.snippetCount() > 0 && this.textMissingCount() === 0;
  }

  // --- Action bar: preview / edit-content links ---
  /** Public rendered page in ez-view (no auth needed). */
  openPreview() {
    if (this.pageId) window.open(`${this.viewUrl}/view/page/${this.pageId}`, '_blank');
  }
  /** ez-view content & image editor (gated by the session cookie). */
  openEditContent() {
    if (this.pageId) window.open(`${this.viewUrl}/edit/page/${this.pageId}`, '_blank');
  }
  /** The content editor, opened with this snippet already selected. */
  editSnippetContent(snippet: SnippetOverride) {
    if (!this.pageId) return;
    // A page can use one snippet twice; &n says which copy (0-based, top down).
    const at = this.pageSnippets.indexOf(snippet);
    const n =
      at > 0 ? this.pageSnippets.slice(0, at).filter((s) => s.id === snippet.id).length : 0;
    window.open(
      `${this.viewUrl}/edit/page/${this.pageId}#snippet=${encodeURIComponent(snippet.id)}&n=${n}`,
      '_blank',
    );
  }
  /** The content editor, opened on its colour panel. */
  openThemeEditor() {
    if (this.pageId) window.open(`${this.viewUrl}/edit/page/${this.pageId}#theme`, '_blank');
  }

  // --- Theme (one-click palettes) ---
  readonly themePresets = THEME_PRESETS;
  /** Name of the palette being applied, while its request is in flight. */
  applyingTheme: string | null = null;
  themeError = '';

  /**
   * The palette the page is on, or null when its colours match none of them
   * (shown as "Custom"). A page with no saved colours renders the template
   * defaults, which resolve to whichever preset equals them.
   */
  get activeTheme(): string | null {
    return activeThemePreset(this.page?.colorVariables)?.name ?? null;
  }

  applyTheme(preset: ThemePreset) {
    if (!this.pageId || this.applyingTheme || this.activeTheme === preset.name) return;
    this.applyingTheme = preset.name;
    this.themeError = '';
    this.pagesService.setPageColors(this.pageId, preset.colors).subscribe({
      next: (updated) => {
        // Only the colours: the rest of the response can be older than a
        // snippet-list save that is still in flight.
        if (this.page) {
          this.page = { ...this.page, colorVariables: updated.colorVariables ?? [] };
        }
        this.applyingTheme = null;
        this.refreshPreview();
      },
      error: (error) => {
        this.applyingTheme = null;
        this.themeError =
          error?.error?.message ?? 'Could not apply that palette. Please try again.';
        console.error('Error applying theme:', error);
      },
    });
  }

  // --- Readiness: a snippet is "ready" once its text and images are both done ---
  needsText(s: SnippetOverride): boolean {
    return !hasCustomText(s);
  }
  needsImages(s: SnippetOverride): boolean {
    return !imagesDone(s, imageTokensOf(s, this.library));
  }
  snippetReady(s: SnippetOverride): boolean {
    return !this.needsText(s) && !this.needsImages(s);
  }
  needsWorkCount(): number {
    return (this.page?.snippets ?? []).filter((s) => !this.snippetReady(s)).length;
  }
  /** 'empty' | 'ready' | 'attention' — drives the action-bar readiness pill. */
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

  loadLicensing() {
    if (!this.pageId) return;
    this.licensingLoading = true;
    this.licensingError = '';
    this.pagesService.getLicensing(this.pageId).subscribe({
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
   * Shutterstock Collection from this page's images and returns its
   * affiliate-wrapped share URL. Nothing is stored — the collection is reaped by
   * age server-side.
   */
  generateCollection() {
    if (!this.pageId || this.generatingCollection) return;
    this.generatingCollection = true;
    this.collectionError = '';
    this.pagesService.generateCollection(this.pageId).subscribe({
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

  /** Download the whole page as a static-site zip. */
  downloadZip() {
    if (!this.pageId || this.downloading) return;
    this.downloading = true;
    this.downloadError = '';
    this.pagesService.downloadPage(this.pageId).subscribe({
      next: (blob) => {
        const slug =
          (this.page?.name || 'page')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'page';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${slug}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        this.downloading = false;
      },
      error: (error) => {
        console.error('Error downloading page:', error);
        this.downloadError = 'Could not build the download. Please try again.';
        this.downloading = false;
      },
    });
  }

  /** Download the licensing manifest as a CSV the user can hand to a client. */
  exportLicensingCsv() {
    const header = 'shutterstock_id,uses,preview_url\n';
    const rows = this.licensing
      .map((i) => `${i.shutterstockId},${i.uses},${i.previewUrl}`)
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.page?.name || 'page'}-image-licenses.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Run AI text customization. onlyMissing customizes just the snippets that
   * were never customized (e.g. ones added after an earlier run) and leaves the
   * others untouched; omit it to re-customize the whole page.
   */
  customize(onlyMissing = false) {
    if (!this.pageId || this.customizing || this.savingDetails) return;
    this.confirming = null;
    this.customizing = true;
    this.customizeError = '';
    this.copyNotice = '';
    // The server writes from the stored brief, so an unsaved one is saved first.
    this.saveBrief(
      () => this.runCustomize(onlyMissing),
      () => {
        this.customizing = false;
        this.customizeError = BRIEF_SAVE_FAILED;
      },
    );
  }

  private runCustomize(onlyMissing: boolean) {
    if (!this.pageId) {
      this.customizing = false;
      return;
    }
    // Same rule the server applies: "missing" is every snippet without text.
    // A full rewrite targets everything.
    const targeted = onlyMissing ? (this.page?.snippets ?? []).map((s) => !hasCustomText(s)) : null;
    this.pagesService.customizePage(this.pageId, onlyMissing).subscribe({
      next: (data) => {
        this.page = data;
        this.loadPageSnippets();
        this.customizing = false;
        this.copyNotice = this.copyResult(targeted, data.snippets ?? []);
        this.refreshPreview();
      },
      error: (error) => {
        console.error('Error customizing page:', error);
        this.customizing = false;
        // Daily AI limit and similar rejections carry a message worth showing.
        this.customizeError =
          error?.error?.message ?? 'Could not customize the text. Please try again.';
      },
    });
  }

  /**
   * What a copy run wrote, for the result line: of the snippets the run
   * targeted, how many now carry text. Counted from the response rather than
   * assumed, because a snippet with no editable text is marked done without
   * any copy being written for it.
   */
  private copyResult(targeted: boolean[] | null, after: SnippetOverride[]): string {
    const written = after.filter(
      (s, i) => (!targeted || targeted[i]) && (s.textReplacementOverride?.length ?? 0) > 0,
    ).length;
    if (written === 0) return 'No copy was written — these sections have no editable text.';
    return `Copy written for ${written} section${written === 1 ? '' : 's'}.`;
  }

  trackBySnippetId(index: number, snippet: SnippetOverride): string {
    return snippet.id || index.toString();
  }

  // --- Image status, over snippets that have image slots at all ---
  private imageSnippets(): SnippetOverride[] {
    return (this.page?.snippets ?? []).filter((s) =>
      hasImageSlots(imageTokensOf(s, this.library)),
    );
  }
  imageSnippetCount(): number {
    return this.imageSnippets().length;
  }
  imagesPopulatedCount(): number {
    return this.imageSnippets().filter((s) => !this.needsImages(s)).length;
  }
  imagesMissingCount(): number {
    return this.imageSnippetCount() - this.imagesPopulatedCount();
  }
  // --- Image slots, counted one by one (the content editor counts the same way) ---
  private imageSlotTotals(): { total: number; filled: number } {
    return this.imageSnippets().reduce(
      (acc, s) => {
        const st = imageSlotStatus(s, imageTokensOf(s, this.library));
        return { total: acc.total + st.total, filled: acc.filled + st.filled };
      },
      { total: 0, filled: 0 },
    );
  }
  imageSlotCount(): number {
    return this.imageSlotTotals().total;
  }
  imageSlotsFilled(): number {
    return this.imageSlotTotals().filled;
  }
  imageSlotsEmpty(): number {
    const t = this.imageSlotTotals();
    return t.total - t.filled;
  }

  /** True once every snippet with image slots has its images. */
  hasAiImages(): boolean {
    return this.imageSnippetCount() > 0 && this.imagesMissingCount() === 0;
  }

  /**
   * Ask the server to fill this page's image slots with stock photos.
   * onlyMissing targets just the not-yet-populated snippets (leaving the rest
   * alone); replaceExisting redoes every slot on the targeted snippets.
   */
  findImages(opts: { onlyMissing?: boolean; replaceExisting?: boolean } = {}) {
    if (!this.pageId || this.findingImages || this.savingDetails) return;

    this.confirming = null;
    this.findingImages = true;
    this.imagesError = '';
    this.imagesNotice = '';
    // Smart fill and the blank-keywords fallback both read the brief.
    this.saveBrief(
      () => this.runFindImages(opts),
      () => {
        this.findingImages = false;
        this.imagesError = BRIEF_SAVE_FAILED;
      },
    );
  }

  private runFindImages(opts: { onlyMissing?: boolean; replaceExisting?: boolean }) {
    if (!this.pageId) {
      this.findingImages = false;
      return;
    }
    const quick = this.imageMode === 'quick';

    this.pagesService
      .customizePageImages(this.pageId, {
        mode: this.imageMode,
        keywords: quick ? this.imageKeywords.trim() || undefined : undefined,
        direction: quick ? undefined : this.imageDirection.trim() || undefined,
        onlyMissing: opts.onlyMissing,
        replaceExisting: opts.replaceExisting,
      })
      .subscribe({
        next: (data) => {
          this.page = data;
          this.loadPageSnippets();
          this.findingImages = false;
          this.imagesNotice = this.imageFillNotice(data.imageFill);
          this.refreshPreview();
        },
        error: (error) => {
          this.findingImages = false;
          this.imagesError = this.imageFillError(error);
          console.error('Error finding images:', error);
        },
      });
  }

  /** Blank keywords search for the site name (else the page name). */
  get keywordsFallback(): string {
    return (this.page?.siteName || this.page?.name || '').trim();
  }

  private imageFillNotice(summary?: ImageFillSummary): string {
    if (!summary) return '';
    if (summary.fellBack) {
      return `AI image search is unavailable right now, so we filled images from "${summary.keywords}". Try Smart fill again later.`;
    }
    if (summary.requested === 0) return 'No image slots needed filling.';
    if (summary.filled < summary.requested) {
      const partial = `Filled ${summary.filled} of ${summary.requested} image slots.`;
      return summary.mode === 'quick' ? `${partial} Broader keywords will find more.` : partial;
    }
    return `Filled ${summary.filled} image slot${summary.filled === 1 ? '' : 's'}.`;
  }

  private imageFillError(error: any): string {
    // 401 means the Shutterstock token is missing server-side, which is a
    // config problem rather than anything the user can fix.
    if (error?.status === 401) return 'Image search is not configured. Check the server settings.';
    // 422: the keyword search found nothing; the server's message says so.
    if (error?.status === 422 && error?.error?.message) return error.error.message;
    return 'Could not find images. Please try again.';
  }

  /** One small AI call for keyword ideas. Typing keywords still works if it fails. */
  suggestKeywords() {
    if (!this.pageId || this.suggestingKeywords || this.savingDetails) return;
    this.suggestingKeywords = true;
    this.keywordsError = '';
    // Suggestions come from the brief, so an unsaved one is saved first.
    this.saveBrief(
      () => this.runSuggestKeywords(),
      () => {
        this.suggestingKeywords = false;
        this.keywordsError = BRIEF_SAVE_FAILED;
      },
    );
  }

  private runSuggestKeywords() {
    if (!this.pageId) return;
    this.pagesService.suggestImageKeywords(this.pageId).subscribe({
      next: ({ keywords }) => {
        this.suggestingKeywords = false;
        this.keywordSuggestions = keywords;
        if (!keywords.length) this.keywordsError = 'No suggestions this time. Type your own keywords.';
      },
      error: (error) => {
        this.suggestingKeywords = false;
        this.keywordsError =
          error?.status === 429
            ? 'Daily AI limit reached. Type your own keywords.'
            : "Couldn't get suggestions right now. Type your own keywords.";
        console.error('Error suggesting keywords:', error);
      },
    });
  }

  private seedDetails() {
    this.details = {
      name: this.page?.name ?? '',
      siteName: this.page?.siteName ?? '',
      description: this.page?.description ?? '',
      slug: this.page?.slug ?? '',
    };
  }

  get detailsDirty(): boolean {
    if (!this.page) return false;
    return (
      this.details.name.trim() !== (this.page.name ?? '') ||
      this.details.siteName.trim() !== (this.page.siteName ?? '') ||
      this.details.description.trim() !== (this.page.description ?? '') ||
      this.details.slug.trim() !== (this.page.slug ?? '')
    );
  }

  resetDetails() {
    this.seedDetails();
    this.detailsError = '';
  }

  // The details model backs two cards: the Site brief (site name and
  // description, always visible because every AI action reads them) and the
  // settings card behind the pencil (name and custom link). Each card shows
  // Save/Cancel for its own half and cancels only its own half.
  get briefDirty(): boolean {
    if (!this.page) return false;
    return (
      this.details.siteName.trim() !== (this.page.siteName ?? '') ||
      this.details.description.trim() !== (this.page.description ?? '')
    );
  }

  get settingsDirty(): boolean {
    if (!this.page) return false;
    return (
      this.details.name.trim() !== (this.page.name ?? '') ||
      this.details.slug.trim() !== (this.page.slug ?? '')
    );
  }

  resetBrief() {
    this.details.siteName = this.page?.siteName ?? '';
    this.details.description = this.page?.description ?? '';
    this.detailsError = '';
  }

  resetSettings() {
    this.details.name = this.page?.name ?? '';
    this.details.slug = this.page?.slug ?? '';
    this.detailsError = '';
  }

  /** True while anything that reads the brief is saving or running. */
  get aiBusy(): boolean {
    return this.customizing || this.findingImages || this.savingDetails;
  }

  /**
   * Save the brief on its own — just site name and description, so a half-typed
   * name or a rejected custom link in the settings card can't block it.
   *
   * Every AI action goes through here first: the server reads the brief from
   * the stored document, so running with unsaved edits would write copy for
   * the old description. `then` runs once the brief is saved (immediately when
   * it already is); `failed` runs if the save is rejected, and the action is
   * not attempted.
   */
  saveBrief(then?: () => void, failed?: () => void) {
    if (!this.pageId || !this.page) return;
    if (!this.briefDirty) {
      then?.();
      return;
    }
    if (this.savingDetails) return;

    this.savingDetails = true;
    this.detailsError = '';

    this.pagesService
      .updatePageDetails(this.pageId, {
        siteName: this.details.siteName.trim(),
        description: this.details.description.trim(),
      })
      .subscribe({
        next: (updated) => {
          // Take only the two saved fields: the rest of the response can be
          // older than a structure change that is still in flight.
          if (this.page) {
            this.page = {
              ...this.page,
              siteName: updated.siteName,
              description: updated.description,
            };
          }
          this.details.siteName = updated.siteName ?? '';
          this.details.description = updated.description ?? '';
          this.savingDetails = false;
          then?.();
        },
        error: (error) => {
          this.savingDetails = false;
          this.detailsError =
            error?.error?.message ?? 'Could not save the site brief. Please try again.';
          console.error('Error saving site brief:', error);
          failed?.();
        },
      });
  }

  saveDetails() {
    if (!this.pageId || this.savingDetails || !this.detailsDirty) return;
    if (!this.details.name.trim()) {
      this.detailsError = 'Name is required.';
      return;
    }

    this.savingDetails = true;
    this.detailsError = '';

    this.pagesService
      .updatePageDetails(this.pageId, {
        name: this.details.name.trim(),
        siteName: this.details.siteName.trim(),
        description: this.details.description.trim(),
        slug: this.details.slug.trim(),
      })
      .subscribe({
        next: (updated) => {
          this.page = updated;
          // Re-seed from the server's response so `detailsDirty` compares
          // against what was actually persisted (e.g. after trimming).
          this.seedDetails();
          this.savingDetails = false;
        },
        error: (error) => {
          this.savingDetails = false;
          // Slug rejections (reserved word, already taken, bad characters) come
          // back with a specific message worth showing — a generic "try again"
          // would leave the customer with no idea what to change.
          this.detailsError =
            error?.error?.message ?? 'Could not save changes. Please try again.';
          console.error('Error updating page details:', error);
        },
      });
  }
}
