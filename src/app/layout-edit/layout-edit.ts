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
import { LayoutsService } from '../layouts.service';
import { SnippetsService } from '../snippets.service';
import { runtimeConfig } from '../runtime-config';
import { Layout, SnippetOverride, SnippetFilters } from '../models';

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

  ngOnInit() {
    this.layoutId = this.route.snapshot.paramMap.get('id');
    if (this.layoutId) {
      this.loadLayout();
    } else {
      this.errorMessage = 'No layout ID provided';
    }
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

  isAiCustomized(): boolean {
    if (!this.layout) return false;
    const allSnippets: SnippetOverride[] = [];
    if (this.layout.nav) allSnippets.push(this.layout.nav as any);
    if (this.layout.footer) allSnippets.push(this.layout.footer as any);
    if (this.layout.subPages) {
      for (const sp of this.layout.subPages) {
        allSnippets.push(...(sp.snippets || []));
      }
    }
    if (allSnippets.length === 0) return false;
    return allSnippets.every((s) => s.aiCustomized === true);
  }

  customize() {
    if (!this.layoutId || this.customizing) return;
    this.customizing = true;
    this.layoutsService.customizeLayout(this.layoutId).subscribe({
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

  /** True once any snippet in the layout has had its images auto-populated. */
  hasAiImages(): boolean {
    const refs: any[] = [];
    if ((this.layout as any)?.nav) refs.push((this.layout as any).nav);
    if ((this.layout as any)?.footer) refs.push((this.layout as any).footer);
    (this.layout?.subPages || []).forEach((sp: any) => {
      (sp.snippets || []).forEach((s: any) => refs.push(s));
    });
    return refs.some((r) => r?.aiImagesPopulated === true);
  }

  /**
   * Ask the server to fill this layout's image slots with stock photos. By
   * default only empty slots are filled, so images picked by hand survive;
   * once images exist the button offers to replace them instead.
   */
  findImages(replaceExisting = false) {
    if (!this.layoutId || this.findingImages) return;

    this.findingImages = true;
    this.imagesError = '';

    this.layoutsService
      .customizeLayoutImages(this.layoutId, {
        direction: this.imageDirection.trim() || undefined,
        replaceExisting,
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
