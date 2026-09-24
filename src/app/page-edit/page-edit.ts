import { Component, inject, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  DragDropModule,
  CdkDragDrop,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PagesService } from '../pages.service';
import { SnippetsService } from '../snippets.service';
import { runtimeConfig, snippetThumbUrl } from '../runtime-config';
import {
  Page,
  SnippetOverride,
  SnippetFilters,
  LicensingImage,
  Template,
} from '../models';
import { TemplatePicker } from '../template-picker/template-picker';
import { SaveTemplateDialog } from '../save-template-dialog/save-template-dialog';
import { TemplatesService } from '../templates.service';
import { ShareLinkService } from '../share-link.service';
import { slugify } from '../slugify';
import { SCRATCH_PAD_LIMIT } from '../scratch-pad';
import { OrgsService } from '../orgs.service';

@Component({
  selector: 'app-page-edit',
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    TemplatePicker,
    SaveTemplateDialog,
  ],
  templateUrl: './page-edit.html',
  styleUrl: './page-edit.css',
})
export class PageEdit implements OnInit {
  private route = inject(ActivatedRoute);
  router = inject(Router);
  private pagesService = inject(PagesService);
  private snippetsService = inject(SnippetsService);
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

  private sanitizer = inject(DomSanitizer);

  page: Page | null = null;
  pageId: string | null = null;
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
  filteredSnippets: SnippetOverride[] = [];
  viewUrl = runtimeConfig.viewUrl;
  // Bound in the template for every snippet thumbnail.
  snippetThumbUrl = snippetThumbUrl;
  customizing = false;

  filters: SnippetFilters = { types: [], tags: [] };
  activeTypeFilter = '';
  activeTagFilter = '';
  /**
   * Starred snippets, org-wide. Held as a Set of ids because the palette asks
   * "is this one starred?" once per tile on every render.
   */
  favoriteIds = new Set<string>();
  showFavoritesOnly = false;

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
  imagesError = '';
  imageDirection = '';
  showImageDirection = false;

  // Live preview (right pane) — an iframe of the public rendered page. The
  // src carries a version counter so we can force a reload after every edit
  // without touching the cross-origin frame directly.
  safePreviewUrl: SafeResourceUrl | null = null;
  previewDevice: 'desktop' | 'mobile' = 'desktop';
  private previewVersion = 0;

  // Snippet palette lives in a slide-in drawer opened by "Add snippet".
  showPalette = false;
  // Second tab in that same drawer: templates. Partials and page templates are
  // offered together — from the user's side both are "drop in a chunk I like".
  paletteTab: 'snippets' | 'templates' | 'scratchpad' = 'snippets';
  // Applying to a page that already has snippets appends by default; replacing
  // is destructive and has no undo, so it stays an explicit choice.
  templateMode: 'append' | 'replace' = 'append';
  templateError: string | null = null;

  // Save-as-template modal.
  showSaveTemplate = false;

  setPaletteTab(tab: 'snippets' | 'templates' | 'scratchpad') {
    this.paletteTab = tab;
    this.templateError = null;
    this.scratchError = null;
  }

  applyTemplate(template: Template) {
    if (!this.pageId) return;
    const mode = this.pageSnippets.length ? this.templateMode : 'replace';

    this.templatesService.applyToPage(this.pageId, template.id, mode).subscribe({
      next: () => {
        this.closePalette();
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
    this.pageId = this.route.snapshot.paramMap.get('id');
    if (this.pageId) {
      this.refreshPreview();
      this.loadPage();
    }
  }

  /** Rebuild the preview iframe URL, bumping the version to force a reload. */
  refreshPreview() {
    if (!this.pageId) return;
    this.previewVersion += 1;
    this.safePreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
      `${this.viewUrl}/view/page/${this.pageId}?_=${this.previewVersion}`,
    );
  }

  setDevice(device: 'desktop' | 'mobile') {
    this.previewDevice = device;
  }

  openPalette() {
    this.showPalette = true;
  }
  closePalette() {
    this.showPalette = false;
  }
  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.showPalette) this.closePalette();
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
        // Don't redirect immediately, let's see what the error is
        // this.router.navigate(['/pages']);
      },
    });
  }

  loadAvailableSnippets() {
    this.loadFavorites();
    this.snippetsService.getAllSnippetSummary().subscribe({
      next: (data) => {
        this.availableSnippets = data;
        this.applyFilters();
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

  /** Reorder within the page structure list (adding is done via the palette). */
  drop(event: CdkDragDrop<SnippetOverride[]>) {
    if (event.previousIndex === event.currentIndex) return;
    moveItemInArray(this.pageSnippets, event.previousIndex, event.currentIndex);
    this.updatePageSnippets();
  }

  updatePageSnippets() {
    if (!this.pageId) return;

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
        this.page = data;
        this.refreshPreview();
      },
      error: (error) => {
        console.error('Error updating page snippets:', error);
        // Optionally revert the UI changes if the server update fails
      },
    });
  }

  applyFilters() {
    this.filteredSnippets = this.availableSnippets.filter((s) => {
      if (this.showFavoritesOnly && !this.favoriteIds.has(s.id)) return false;
      if (this.activeTypeFilter && s.type !== this.activeTypeFilter) return false;
      if (this.activeTagFilter && !(s.tags || []).includes(this.activeTagFilter)) return false;
      return true;
    });
  }

  // --- Favorites -----------------------------------------------------------
  //
  // A view of the library, not a separate collection — hence a filter toggle
  // next to type and tags rather than another tab.

  private loadFavorites() {
    this.orgsService.listFavorites().subscribe({
      next: ({ favorites }) => {
        this.favoriteIds = new Set(favorites.map((f) => f.snippetId));
        this.applyFilters();
      },
      // A failed star list is not worth interrupting the editor for; the
      // palette just shows nothing starred.
      error: () => {},
    });
  }

  isFavorite(snippetId: string): boolean {
    return this.favoriteIds.has(snippetId);
  }

  // `Event`, not `MouseEvent`: the star is also reachable by keyboard, and the
  // keydown binding hands over a KeyboardEvent.
  toggleFavorite(snippetId: string, event: Event) {
    // The star sits on top of the tile, and the tile adds the snippet.
    event.stopPropagation();

    const wasFavorite = this.favoriteIds.has(snippetId);
    // Flip locally first so the star responds to the click immediately; the
    // response replaces the whole set either way.
    if (wasFavorite) this.favoriteIds.delete(snippetId);
    else this.favoriteIds.add(snippetId);
    this.applyFilters();

    const request = wasFavorite
      ? this.orgsService.removeFavorite(snippetId)
      : this.orgsService.addFavorite(snippetId);

    request.subscribe({
      next: ({ favorites }) => {
        this.favoriteIds = new Set(favorites.map((f) => f.snippetId));
        this.applyFilters();
      },
      error: (err) => {
        // Put the star back where it was, and surface the cap message.
        if (wasFavorite) this.favoriteIds.add(snippetId);
        else this.favoriteIds.delete(snippetId);
        this.applyFilters();
        this.scratchError = err?.error?.message ?? 'Could not update favorites.';
      },
    });
  }

  toggleFavoritesFilter() {
    this.showFavoritesOnly = !this.showFavoritesOnly;
    this.applyFilters();
  }

  setTypeFilter(type: string) {
    this.activeTypeFilter = this.activeTypeFilter === type ? '' : type;
    this.applyFilters();
  }

  setTagFilter(tag: string) {
    this.activeTagFilter = this.activeTagFilter === tag ? '' : tag;
    this.applyFilters();
  }

  clearFilters() {
    this.activeTypeFilter = '';
    this.activeTagFilter = '';
    this.showFavoritesOnly = false;
    this.applyFilters();
  }

  // --- Text customization status (per snippet, via the aiCustomized flag) ---
  snippetCount(): number {
    return this.page?.snippets?.length ?? 0;
  }
  textCustomizedCount(): number {
    return (this.page?.snippets ?? []).filter((s) => s.aiCustomized === true)
      .length;
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

  // --- Readiness: a snippet is "ready" once its text and images are both done ---
  snippetReady(s: SnippetOverride): boolean {
    return s.aiCustomized === true && s.aiImagesPopulated === true;
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

  /** Bring the snippet palette into view (matters when the layout stacks). */
  scrollToPalette() {
    document
      .getElementById('available-panel')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * Run AI text customization. onlyMissing customizes just the snippets that
   * were never customized (e.g. ones added after an earlier run) and leaves the
   * others untouched; omit it to re-customize the whole page.
   */
  customize(onlyMissing = false) {
    if (!this.pageId || this.customizing) return;
    this.customizing = true;
    this.pagesService.customizePage(this.pageId, onlyMissing).subscribe({
      next: (data) => {
        this.page = data;
        this.customizing = false;
        this.refreshPreview();
      },
      error: (error) => {
        console.error('Error customizing page:', error);
        this.customizing = false;
      },
    });
  }

  trackBySnippetId(index: number, snippet: SnippetOverride): string {
    return snippet.id || index.toString();
  }

  // --- Image population status (per snippet, via the aiImagesPopulated flag) ---
  imagesPopulatedCount(): number {
    return (this.page?.snippets ?? []).filter(
      (s) => s.aiImagesPopulated === true,
    ).length;
  }
  imagesMissingCount(): number {
    return this.snippetCount() - this.imagesPopulatedCount();
  }
  /** True once every snippet on the page has been through image population. */
  hasAiImages(): boolean {
    return this.snippetCount() > 0 && this.imagesMissingCount() === 0;
  }

  /**
   * Ask the server to fill this page's image slots with stock photos.
   * onlyMissing targets just the not-yet-populated snippets (leaving the rest
   * alone); replaceExisting redoes every slot on the targeted snippets.
   */
  findImages(opts: { onlyMissing?: boolean; replaceExisting?: boolean } = {}) {
    if (!this.pageId || this.findingImages) return;

    this.findingImages = true;
    this.imagesError = '';

    this.pagesService
      .customizePageImages(this.pageId, {
        direction: this.imageDirection.trim() || undefined,
        onlyMissing: opts.onlyMissing,
        replaceExisting: opts.replaceExisting,
      })
      .subscribe({
        next: (data) => {
          this.page = data;
          this.findingImages = false;
          this.refreshPreview();
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
