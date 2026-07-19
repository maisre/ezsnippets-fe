import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import { OverflowMenu } from '../overflow-menu/overflow-menu';
import { PagesService } from '../pages.service';
import { PlansService, PlanUsage } from '../plans.service';
import { AuthService } from '../auth.service';
import { runtimeConfig } from '../runtime-config';
import { Page } from '../models';

@Component({
  selector: 'app-pages',
  imports: [CommonModule, FormsModule, RouterLink, OverflowMenu, CdkMenu, CdkMenuItem],
  templateUrl: './pages.html',
  styleUrl: './pages.css',
})
export class Pages implements OnInit {
  private pagesService = inject(PagesService);
  private plansService = inject(PlansService);
  private authService = inject(AuthService);
  private router = inject(Router);
  pages: Page[] = [];
  usage: PlanUsage | null = null;

  newPage = {
    name: '',
    siteName: '',
    description: '',
  };

  ngOnInit() {
    this.loadPages();
    this.loadUsage();
  }

  loadPages() {
    this.pagesService.getAllPages().subscribe({
      next: (data) => (this.pages = data),
      error: (error) => console.error('Error fetching pages:', error),
    });
  }

  loadUsage() {
    this.plansService.getUsage().subscribe({
      next: (data) => (this.usage = data),
      error: (error) => console.error('Error fetching usage:', error),
    });
  }

  // GET /pages returns archived pages too; they're listed separately and don't
  // count toward the plan limit (the server's usage figures already exclude
  // them, so canCreate/limitMessage need no adjustment).
  get activePages(): Page[] {
    return this.pages.filter((p) => p.status !== 'archived');
  }

  get archivedPages(): Page[] {
    return this.pages.filter((p) => p.status === 'archived');
  }

  get canCreate(): boolean {
    if (!this.usage?.hasPlan) return false;
    if (!this.usage.limits || this.usage.limits.maxPages === -1) return true;
    return (this.usage.usage?.pages ?? 0) < this.usage.limits.maxPages;
  }

  get limitMessage(): string {
    if (!this.usage) return '';
    if (!this.usage.hasPlan) return 'Subscribe to a plan to create pages.';
    if (!this.usage.limits) return '';
    if (this.usage.limits.maxPages === -1) return 'Unlimited pages';
    const used = this.usage.usage?.pages ?? 0;
    return `${used} / ${this.usage.limits.maxPages} pages used`;
  }

  createPage() {
    if (!this.newPage.name.trim()) {
      return;
    }

    const pageData = {
      name: this.newPage.name.trim(),
      siteName: this.newPage.siteName.trim() || undefined,
      description: this.newPage.description.trim() || undefined,
      snippets: [],
    };

    this.pagesService.createPage(pageData).subscribe({
      next: (createdPage) => {
        this.pages.push(createdPage);
        this.newPage = { name: '', siteName: '', description: '' };
        this.loadUsage();
      },
      error: (error) => console.error('Error creating page:', error),
    });
  }

  // Shown when the user tries to duplicate while at their plan limit.
  showLimitModal = false;

  // Duplicate is always clickable; if the user is at their limit we surface the
  // upgrade modal instead of firing a doomed request. canCreate already encodes
  // the no-plan and at-limit cases. The server's 403 is handled as a backstop.
  duplicatePage(pageId: string) {
    if (!this.canCreate) {
      this.showLimitModal = true;
      return;
    }
    this.pagesService.duplicatePage(pageId).subscribe({
      next: (created) => {
        this.pages.push(created);
        this.loadUsage();
      },
      error: (error) => {
        if (error?.status === 403) this.showLimitModal = true;
        else console.error('Error duplicating page:', error);
      },
    });
  }

  closeLimitModal() {
    this.showLimitModal = false;
  }

  editPage(pageId: string) {
    this.router.navigate(['/p/edit', pageId]);
  }

  viewPage(pageId: string) {
    window.open(`${runtimeConfig.viewUrl}/view/page/${pageId}`, '_blank');
  }

  // Opens the ez-view content editor. The ez_session cookie (scoped to the
  // shared domain) authenticates the editor, but it's short-lived — so we
  // refresh it first, then point the tab at the editor. The tab is opened
  // synchronously (preserving the click gesture so it isn't popup-blocked)
  // and navigated once the refresh resolves; on failure we still open the
  // editor, which falls back to its own sign-in flow.
  editContent(pageId: string) {
    const editorUrl = `${runtimeConfig.viewUrl}/edit/page/${pageId}`;
    const tab = window.open('', '_blank');
    const go = () => {
      if (tab) tab.location.href = editorUrl;
      else window.open(editorUrl, '_blank');
    };
    this.authService.refreshSessionCookie().subscribe({
      next: go,
      error: go,
    });
  }

  // Set when the user picks Delete from an overflow menu; null when hidden.
  deleteTarget: { id: string; name: string } | null = null;
  deleting = false;
  deleteError = '';

  showArchived = false;

  // Archiving frees a plan slot and takes the page offline in ez-view.
  archivePage(pageId: string) {
    this.pagesService.archivePage(pageId).subscribe({
      next: (updated) => this.replacePage(updated),
      error: (error) => console.error('Error archiving page:', error),
    });
  }

  // Restoring re-occupies a plan slot, so the server may reject it with a 403.
  restorePage(pageId: string) {
    this.pagesService.restorePage(pageId).subscribe({
      next: (updated) => this.replacePage(updated),
      error: (error) => {
        if (error?.status === 403) this.showLimitModal = true;
        else console.error('Error restoring page:', error);
      },
    });
  }

  private replacePage(updated: Page) {
    this.pages = this.pages.map((p) => (p.id === updated.id ? updated : p));
    this.loadUsage();
  }

  openDelete(page: Page) {
    this.deleteError = '';
    this.deleteTarget = { id: page.id, name: page.name || 'this page' };
  }

  closeDeleteModal() {
    if (this.deleting) return;
    this.deleteTarget = null;
  }

  confirmDelete() {
    if (!this.deleteTarget || this.deleting) return;
    const id = this.deleteTarget.id;
    this.deleting = true;
    this.deleteError = '';

    this.pagesService.deletePage(id).subscribe({
      next: () => {
        this.pages = this.pages.filter((p) => p.id !== id);
        this.deleting = false;
        this.deleteTarget = null;
        this.loadUsage();
      },
      error: (error) => {
        this.deleting = false;
        this.deleteError = 'Something went wrong. Please try again.';
        console.error('Error deleting page:', error);
      },
    });
  }
}
