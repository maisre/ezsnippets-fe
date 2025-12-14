import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  DragDropModule,
  CdkDragDrop,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { LayoutsService } from '../layouts.service';
import { SnippetsService } from '../snippets.service';
import { environment } from '../../environments/environment';
import { Layout, SnippetOverride } from '../models';

@Component({
  selector: 'app-layout-edit',
  imports: [CommonModule, DragDropModule],
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
  activeSubPageIndex = 0;
  viewUrl = environment.viewUrl;

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
          snippets: subPage.snippets.map((snippet) => ({
            id: snippet.id,
            cssOverride: '',
            htmlOverride: {},
            jsOverride: '',
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

  trackBySnippetId(index: number, snippet: SnippetOverride): string {
    return snippet.id || index.toString();
  }

  trackBySubPageIndex(index: number): number {
    return index;
  }
}
