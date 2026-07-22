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
import { runtimeConfig } from '../runtime-config';
import { Page, SnippetOverride, SnippetFilters } from '../models';

@Component({
  selector: 'app-page-edit',
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './page-edit.html',
  styleUrl: './page-edit.css',
})
export class PageEdit implements OnInit {
  private route = inject(ActivatedRoute);
  router = inject(Router);
  private pagesService = inject(PagesService);
  private snippetsService = inject(SnippetsService);
  private sanitizer = inject(DomSanitizer);

  page: Page | null = null;
  pageId: string | null = null;
  pageSnippets: SnippetOverride[] = [];
  availableSnippets: SnippetOverride[] = [];
  filteredSnippets: SnippetOverride[] = [];
  viewUrl = runtimeConfig.viewUrl;
  customizing = false;

  filters: SnippetFilters = { types: [], tags: [] };
  activeTypeFilter = '';
  activeTagFilter = '';

  // Editable name/siteName/description, seeded from the loaded page. Kept
  // separate from `page` so Cancel can discard edits and `detailsDirty` can
  // compare against what's actually saved.
  details = { name: '', siteName: '', description: '' };
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

  // Finalize drawer (readiness checklist + Shutterstock licensing hand-off).
  showFinalize = false;
  finalizeTab: 'checklist' | 'licensing' = 'checklist';
  licensing: Array<{ shutterstockId: string; previewUrl: string; token: string; uses: number }> = [];
  licensingLoading = false;
  licensingError = '';
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

      if (foundSnippet) {
        // The library summary supplies display fields (name/type/tags) for the
        // palette; the page's stored snippet supplies the page-scoped
        // customizations (text/image overrides, AI flags). Spread the stored
        // snippet last so its customizations survive — otherwise editing the
        // snippet list would round-trip a customization-free copy and wipe it.
        this.pageSnippets.push({ ...foundSnippet, ...pageSnippet });
      }
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
        this.licensingLoading = false;
      },
      error: (error) => {
        console.error('Error loading licensing:', error);
        this.licensingError = 'Could not load the image list. Please try again.';
        this.licensingLoading = false;
      },
    });
  }

  /** Deep link to the asset on Shutterstock so the user can license it. */
  shutterstockUrl(id: string): string {
    return `https://www.shutterstock.com/image-photo/${id}`;
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
    };
  }

  get detailsDirty(): boolean {
    if (!this.page) return false;
    return (
      this.details.name.trim() !== (this.page.name ?? '') ||
      this.details.siteName.trim() !== (this.page.siteName ?? '') ||
      this.details.description.trim() !== (this.page.description ?? '')
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
          this.detailsError = 'Could not save changes. Please try again.';
          console.error('Error updating page details:', error);
        },
      });
  }
}
