import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  DragDropModule,
  CdkDragDrop,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
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

  // Stock-image population. Kept separate from `customizing` so the two AI
  // actions can't be mistaken for one, and so re-running text never re-runs
  // images (each is its own OpenAI call server-side).
  findingImages = false;
  imagesError = '';
  imageDirection = '';
  showImageDirection = false;

  ngOnInit() {
    this.pageId = this.route.snapshot.paramMap.get('id');
    if (this.pageId) {
      this.loadPage();
    }
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

  drop(event: CdkDragDrop<SnippetOverride[]>) {
    if (event.previousContainer === event.container) {
      // Reordering within the same list
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);

      // If reordering within page snippets, save the new order
      if (event.container.id === 'page-snippets') {
        this.updatePageSnippets();
      }
    } else {
      // Moving between lists
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );

      // Update the page's snippets on the server
      this.updatePageSnippets();
    }
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
        console.log('Page snippets updated successfully:', data);
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
