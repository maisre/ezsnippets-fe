import { Component, inject, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  DragDropModule,
  CdkDragDrop,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { LayoutsService } from '../layouts.service';
import { TemplatesService } from '../templates.service';
import { ShareLinkService } from '../share-link.service';
import { slugify } from '../slugify';
import { SCRATCH_PAD_LIMIT } from '../scratch-pad';
import { OrgsService } from '../orgs.service';
import { TemplatePicker } from '../template-picker/template-picker';
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
  imports: [CommonModule, FormsModule, DragDropModule, TemplatePicker, SaveTemplateDialog],
  templateUrl: './layout-edit.html',
  styleUrl: './layout-edit.css',
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

  layout: Layout | null = null;
  layoutId: string | null = null;
  errorMessage: string | null = null;

  navbarSnippets: SnippetOverride[] = [];
  footerSnippets: SnippetOverride[] = [];
  availableSnippets: SnippetOverride[] = [];
  filteredSnippets: SnippetOverride[] = [];
  activeSubPageIndex = 0;
  viewUrl = runtimeConfig.viewUrl;
  // Bound in the template for every snippet thumbnail.
  snippetThumbUrl = snippetThumbUrl;
  customizing = false;

  filters: SnippetFilters = { types: [], tags: [] };
  activeTypeFilter = '';
  activeTagFilter = '';

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
    this.loadFavorites();
    this.snippetsService.getAllSnippetSummary().subscribe({
      next: (data) => {
        this.availableSnippets = data;
        this.applyFilters();
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
  // site template, and dropping a partial/page template into the subpage
  // that's currently open.
  showTemplates = false;
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

  // --- Favorites -----------------------------------------------------------
  //
  // Org-wide, and a view of the library rather than a separate collection —
  // hence a filter chip beside type and tags.
  favoriteIds = new Set<string>();
  showFavoritesOnly = false;

  private loadFavorites() {
    this.orgsService.listFavorites().subscribe({
      next: ({ favorites }) => {
        this.favoriteIds = new Set(favorites.map((f) => f.snippetId));
        this.applyFilters();
      },
      error: () => {},
    });
  }

  isFavorite(snippetId: string): boolean {
    return this.favoriteIds.has(snippetId);
  }

  // `Event`, not `MouseEvent`: the star is keyboard-reachable too.
  toggleFavorite(snippetId: string, event: Event) {
    event.stopPropagation();
    const wasFavorite = this.favoriteIds.has(snippetId);
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

  toggleTemplates() {
    this.showTemplates = !this.showTemplates;
    this.templateError = null;
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
          this.showTemplates = false;
          this.loadLayout();
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

    // Initialize subPages if they don't exist
    if (!this.layout.subPages || this.layout.subPages.length === 0) {
      this.layout.subPages = [{ name: 'Default', snippets: [] }];
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
  }

  getActiveSubPageSnippets(): SnippetOverride[] {
    if (!this.layout?.subPages?.[this.activeSubPageIndex]) {
      return [];
    }
    return this.layout.subPages[this.activeSubPageIndex].snippets || [];
  }

  setActiveSubPage(index: number) {
    this.activeSubPageIndex = index;
  }

  getConnectedDropLists(): string[] {
    const lists = ['available-snippets', 'navbar-snippets', 'footer-snippets'];
    if (this.layout?.subPages) {
      this.layout.subPages.forEach((_, index) => {
        lists.push(`subpage-${index}`);
      });
    }
    return lists;
  }

  drop(event: CdkDragDrop<SnippetOverride[]>, target: 'navbar' | 'footer' | 'subpage') {
    if (event.previousContainer === event.container) {
      // Reordering within the same list
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);

      if (target === 'subpage') {
        this.updateLayout();
      }
    } else {
      // Handle single-snippet areas (navbar and footer)
      if (target === 'navbar' || target === 'footer') {
        // These areas can only hold one snippet, so replace if needed
        if (event.container.data.length > 0) {
          // Return the existing snippet back to available
          const existingSnippet = event.container.data[0];
          this.availableSnippets.push(existingSnippet);
        }

        // Clear the target area
        event.container.data.length = 0;

        // Add the new snippet
        const movedSnippet = event.previousContainer.data[event.previousIndex];
        event.container.data.push({ ...movedSnippet });

        // Remove from source if it's not available snippets (which acts as a copy source)
        if (event.previousContainer.id !== 'available-snippets') {
          event.previousContainer.data.splice(event.previousIndex, 1);
        }
      } else {
        // Multiple snippet areas (subpages)
        if (event.previousContainer.id === 'available-snippets') {
          // Copy from available snippets
          const snippet = event.previousContainer.data[event.previousIndex];
          event.container.data.splice(event.currentIndex, 0, { ...snippet });
        } else {
          // Move between snippet areas
          transferArrayItem(
            event.previousContainer.data,
            event.container.data,
            event.previousIndex,
            event.currentIndex
          );
        }
      }

      this.updateLayout();
    }
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
      next: (data) => {
        // Update local layout object with server response
        this.layout = data;
      },
      error: (error) => {
        console.error('Error updating layout:', error);
        console.error('Error details:', error.error);
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
