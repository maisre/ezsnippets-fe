import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { PagesService } from '../pages.service';
import { LayoutsService } from '../layouts.service';
import { AuthService } from '../auth.service';
import { runtimeConfig } from '../runtime-config';
import { Page, Layout } from '../models';

const PLACEHOLDER_THUMBNAIL = '/card-placeholder.svg';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  private pagesService = inject(PagesService);
  private layoutsService = inject(LayoutsService);
  private authService = inject(AuthService);
  private router = inject(Router);

  readonly placeholder = PLACEHOLDER_THUMBNAIL;

  pages: Page[] = [];
  layouts: Layout[] = [];

  ngOnInit() {
    this.loadPages();
    this.loadLayouts();
  }

  loadPages() {
    this.pagesService.getAllPages().subscribe({
      next: (data) => (this.pages = data),
      error: (error) => console.error('Error fetching pages:', error),
    });
  }

  loadLayouts() {
    this.layoutsService.getAllLayouts().subscribe({
      next: (data) => (this.layouts = data),
      error: (error) => console.error('Error fetching layouts:', error),
    });
  }

  // Falls back to the placeholder if a thumbnail URL is set but fails to load
  // (e.g. the screenshot was deleted or hasn't finished generating).
  onThumbnailError(event: Event) {
    const img = event.target as HTMLImageElement;
    if (img.src !== window.location.origin + this.placeholder) {
      img.src = this.placeholder;
    }
  }

  editPage(pageId: string) {
    this.router.navigate(['/p/edit', pageId]);
  }

  viewPage(pageId: string) {
    window.open(`${runtimeConfig.viewUrl}/view/page/${pageId}`, '_blank');
  }

  // Mirrors the pages list: refresh the short-lived ez_session cookie, then
  // point a new tab at the ez-view content editor. The tab is opened
  // synchronously to preserve the click gesture (avoids popup blocking).
  editContent(pageId: string) {
    const editorUrl = `${runtimeConfig.viewUrl}/edit/page/${pageId}`;
    const tab = window.open('', '_blank');
    const go = () => {
      if (tab) tab.location.href = editorUrl;
      else window.open(editorUrl, '_blank');
    };
    this.authService.refreshSessionCookie().subscribe({ next: go, error: go });
  }

  editLayout(layoutId: string) {
    this.router.navigate(['/l/edit', layoutId]);
  }
}
