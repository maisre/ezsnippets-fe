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

  page: any = null;
  pageId: string | null = null;
  pageSnippets: any[] = [];
  availableSnippets: any[] = [];
  viewUrl = environment.viewUrl;

  ngOnInit() {
    this.pageId = this.route.snapshot.paramMap.get('id');
    if (this.pageId) {
      this.loadPage();
    }
  }

  loadPage() {
    if (!this.pageId) return;

    console.log('Loading page with ID:', this.pageId);
    this.pagesService.getPageById(this.pageId).subscribe({
      next: (data) => {
        console.log('Page loaded successfully:', data);
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
    console.log('Loading all available snippets');
    this.snippetsService.getAllSnippetSummary().subscribe({
      next: (data) => {
        console.log('Available snippets loaded successfully:', data);
        this.availableSnippets = data;

        // Copy snippets from this.page.snippets into pageSnippets array
        this.loadPageSnippets();
      },
      error: (error) => {
        console.error('Error loading available snippets:', error);
        console.error('Error details:', error.status, error.message);
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
    this.page.snippets.forEach((pageSnippet: any) => {
      // Handle both snippet objects and snippet IDs
      const snippetId = typeof pageSnippet === 'string' ? pageSnippet : pageSnippet.id;

      // Find the corresponding snippet in availableSnippets
      const foundSnippet = this.availableSnippets.find((snippet) => snippet._id === snippetId);

      if (foundSnippet) {
        // Copy the snippet into pageSnippets array
        this.pageSnippets.push({ ...foundSnippet });
      }
    });

    console.log('Page snippets loaded:', this.pageSnippets);
  }

  drop(event: CdkDragDrop<any[]>) {
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
    console.log('page snippets');
    console.log(this.pageSnippets);

    const snippets = this.pageSnippets.map((snippet) => ({
      id: snippet._id,
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

  trackBySnippetId(index: number, snippet: any): string {
    return snippet.id || index;
  }
}
