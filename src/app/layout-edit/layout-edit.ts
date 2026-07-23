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
import { SnippetsService } from '../snippets.service';
import { runtimeConfig } from '../runtime-config';
import { Layout, SnippetOverride, SnippetFilters, LicensingImage } from '../models';

@Component({
  selector: 'app-layout-edit',
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './layout-edit.html',
  styleUrl: './layout-edit.css',
})
export class LayoutEdit implements OnInit {
  private route = inject(ActivatedRoute);
  router = inject(Router);
  private layoutsService = inject(LayoutsService);
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
  customizing = false;

  filters: SnippetFilters = { types: [], tags: [] };
  activeTypeFilter = '';
  activeTagFilter = '';

  // Editable name/siteName/description, seeded from the loaded layout. Kept
  // separate from `layout` so Cancel can discard edits and `detailsDirty` can
  // compare against what's actually saved.
  details = { name: '', siteName: '', description: '' };
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
    if (this.layoutId) window.open(`${this.viewUrl}/view/layout/${this.layoutId}`, '_blank');
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

  loadLayoutSnippets() {
    if (!this.layout || !this.availableSnippets.length) {
      return;
    }

    // Load navbar snippet
    this.navbarSnippets = [];
    if (this.layout.nav) {
      const navbarSnippet = this.availableSnippets.find((s) => s.id === this.layout!.nav);
      if (navbarSnippet) {
        this.navbarSnippets.push({ ...navbarSnippet });
      }
    }

    // Load footer snippet
    this.footerSnippets = [];
    if (this.layout.footer) {
      const footerSnippet = this.availableSnippets.find((s) => s.id === this.layout!.footer);
      if (footerSnippet) {
        this.footerSnippets.push({ ...footerSnippet });
      }
    }

    // Initialize subPages if they don't exist
    if (!this.layout.subPages || this.layout.subPages.length === 0) {
      this.layout.subPages = [{ name: 'Default', snippets: [] }];
    }

    // Load subPage snippets
    this.layout.subPages = this.layout.subPages.map((subPage) => ({
      ...subPage,
      snippets: subPage.snippets
        .map((snippetRef) => {
          const fullSnippet = this.availableSnippets.find((s) => s.id === snippetRef.id);
          return fullSnippet ? { ...fullSnippet, ...snippetRef } : null;
        })
        .filter((s) => s !== null) as SnippetOverride[],
    }));
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
      nav: this.navbarSnippets.length > 0 ? this.navbarSnippets[0].id : '',
      footer: this.footerSnippets.length > 0 ? this.footerSnippets[0].id : '',
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
    };
  }

  get detailsDirty(): boolean {
    if (!this.layout) return false;
    return (
      this.details.name.trim() !== (this.layout.name ?? '') ||
      this.details.siteName.trim() !== (this.layout.siteName ?? '') ||
      this.details.description.trim() !== (this.layout.description ?? '')
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
          this.detailsError = 'Could not save changes. Please try again.';
          console.error('Error updating layout details:', error);
        },
      });
  }
}
