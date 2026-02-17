import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  DragDropModule,
  CdkDragDrop,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { PagesService } from '../pages.service';
import { SnippetsService } from '../snippets.service';
import { environment } from '../../environments/environment';
import { Page, SnippetOverride, SnippetFilters } from '../models';

@Component({
  selector: 'app-page-edit',
  imports: [CommonModule, DragDropModule],
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
  viewUrl = environment.viewUrl;
  customizing = false;

  filters: SnippetFilters = { types: [], tags: [] };
  activeTypeFilter = '';
  activeTagFilter = '';

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
        // Copy the snippet into pageSnippets array
        this.pageSnippets.push({ ...foundSnippet });
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

    const snippets = this.pageSnippets.map((snippet) => ({
      id: snippet.id,
      cssOverride: '',
      jsOverride: '',
      htmlOverride: '',
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

  isAiCustomized(): boolean {
    if (!this.page || this.page.snippets.length === 0) return false;
    return this.page.snippets.every((s) => s.aiCustomized === true);
  }

  customize() {
    if (!this.pageId || this.customizing) return;
    this.customizing = true;
    this.pagesService.customizePage(this.pageId).subscribe({
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
}
