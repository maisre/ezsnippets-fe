import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import { OverflowMenu } from '../overflow-menu/overflow-menu';
import { PagesService } from '../pages.service';
import { LayoutsService } from '../layouts.service';
import { PlansService, PlanUsage } from '../plans.service';
import { AuthService } from '../auth.service';
import { runtimeConfig } from '../runtime-config';
import { Page, Layout } from '../models';

const PLACEHOLDER_THUMBNAIL = '/card-placeholder.svg';

type ResourceKind = 'page' | 'layout';

interface LimitModal {
  kind: ResourceKind;
  used: number;
  max: number;
}

interface DeleteModal {
  kind: ResourceKind;
  id: string;
  name: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, FormsModule, RouterLink, OverflowMenu, CdkMenu, CdkMenuItem],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  private pagesService = inject(PagesService);
  private layoutsService = inject(LayoutsService);
  private plansService = inject(PlansService);
  private authService = inject(AuthService);
  private router = inject(Router);

  readonly placeholder = PLACEHOLDER_THUMBNAIL;

  pages: Page[] = [];
  layouts: Layout[] = [];
  usage: PlanUsage | null = null;

  // Set when the user tries to duplicate/create while at their plan limit;
  // drives the "upgrade" modal. Null when hidden.
  limitModal: LimitModal | null = null;

  // Set when the create modal is open; null when hidden. Backing fields for its
  // form live below.
  createModal: { kind: ResourceKind } | null = null;
  newName = '';
  newSiteName = '';
  newDescription = '';
  creating = false;
  createError = '';

  // Set when the user picks Delete from an overflow menu; null when hidden.
  deleteModal: DeleteModal | null = null;
  deleting = false;
  deleteError = '';

  // Archived items are hidden behind a toggle so they don't crowd the grids.
  showArchivedPages = false;
  showArchivedLayouts = false;

  ngOnInit() {
    this.loadPages();
    this.loadLayouts();
    this.loadUsage();
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

  loadUsage() {
    this.plansService.getUsage().subscribe({
      next: (data) => (this.usage = data),
      error: (error) => console.error('Error fetching usage:', error),
    });
  }

  // GET /pages and /layouts return archived items too, so every "how many am I
  // using" calculation has to go through these rather than the raw arrays —
  // archived items deliberately don't count toward the plan limit.
  get activePages(): Page[] {
    return this.pages.filter((p) => p.status !== 'archived');
  }

  get archivedPages(): Page[] {
    return this.pages.filter((p) => p.status === 'archived');
  }

  get activeLayouts(): Layout[] {
    return this.layouts.filter((l) => l.status !== 'archived');
  }

  get archivedLayouts(): Layout[] {
    return this.layouts.filter((l) => l.status === 'archived');
  }

  // -1 (or a missing limit) means unlimited. Returns null when there's no plan
  // or the limit is unlimited, so the template can hide the "used / max" badge.
  get pageLimit(): number | null {
    const max = this.usage?.limits?.maxPages;
    return max == null || max === -1 ? null : max;
  }

  get layoutLimit(): number | null {
    const max = this.usage?.limits?.maxLayouts;
    return max == null || max === -1 ? null : max;
  }

  private atLimit(kind: ResourceKind): boolean {
    // No plan blocks creation entirely; server echoes this via 403.
    if (!this.usage?.hasPlan) return true;
    const max = kind === 'page' ? this.pageLimit : this.layoutLimit;
    if (max == null) return false; // unlimited
    const used =
      kind === 'page' ? this.activePages.length : this.activeLayouts.length;
    return used >= max;
  }

  private showLimitModal(kind: ResourceKind) {
    const max = (kind === 'page' ? this.pageLimit : this.layoutLimit) ?? 0;
    const used =
      kind === 'page' ? this.activePages.length : this.activeLayouts.length;
    this.limitModal = { kind, used, max };
  }

  closeLimitModal() {
    this.limitModal = null;
  }

  // Both the header "+ New" button and the create tile call this. If the user
  // is at their limit we divert to the upgrade modal instead of opening the
  // create form (consistent with duplicate).
  openCreate(kind: ResourceKind) {
    if (this.atLimit(kind)) {
      this.showLimitModal(kind);
      return;
    }
    this.newName = '';
    this.newSiteName = '';
    this.newDescription = '';
    this.createError = '';
    this.createModal = { kind };
  }

  closeCreateModal() {
    this.createModal = null;
  }

  submitCreate() {
    if (!this.createModal || !this.newName.trim() || this.creating) return;
    const kind = this.createModal.kind;
    this.creating = true;
    this.createError = '';

    const base = {
      name: this.newName.trim(),
      siteName: this.newSiteName.trim() || undefined,
      description: this.newDescription.trim() || undefined,
    };

    if (kind === 'page') {
      this.pagesService.createPage({ ...base, snippets: [] }).subscribe({
        next: (created) => {
          this.pages.push(created);
          this.afterCreate();
        },
        error: (error) => this.onCreateError(error, 'page'),
      });
    } else {
      this.layoutsService.createLayout(base).subscribe({
        next: (created) => {
          this.layouts.push(created);
          this.afterCreate();
        },
        error: (error) => this.onCreateError(error, 'layout'),
      });
    }
  }

  private afterCreate() {
    this.creating = false;
    this.createModal = null;
    this.loadUsage();
  }

  // A 403 means the server rejected on the plan limit (client usage was stale);
  // swap the create modal for the upgrade modal. Anything else is a transient
  // error shown inline so the user can retry.
  private onCreateError(error: any, kind: ResourceKind) {
    this.creating = false;
    if (error?.status === 403) {
      this.createModal = null;
      this.showLimitModal(kind);
    } else {
      this.createError = 'Something went wrong. Please try again.';
      console.error('Error creating:', error);
    }
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

  // The duplicate button is always enabled. If the user is already at their
  // plan limit we short-circuit to the upgrade modal instead of firing a
  // doomed request; the server still enforces the limit (403), which we treat
  // as the same "at limit" case in the error handler as a backstop.
  duplicatePage(pageId: string) {
    if (this.atLimit('page')) {
      this.showLimitModal('page');
      return;
    }
    this.pagesService.duplicatePage(pageId).subscribe({
      next: (created) => {
        this.pages.push(created);
        this.loadUsage();
      },
      error: (error) => {
        if (error?.status === 403) this.showLimitModal('page');
        else console.error('Error duplicating page:', error);
      },
    });
  }

  duplicateLayout(layoutId: string) {
    if (this.atLimit('layout')) {
      this.showLimitModal('layout');
      return;
    }
    this.layoutsService.duplicateLayout(layoutId).subscribe({
      next: (created) => {
        this.layouts.push(created);
        this.loadUsage();
      },
      error: (error) => {
        if (error?.status === 403) this.showLimitModal('layout');
        else console.error('Error duplicating layout:', error);
      },
    });
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

  viewLayout(layoutId: string) {
    window.open(`${runtimeConfig.viewUrl}/view/layout/${layoutId}`, '_blank');
  }

  editLayout(layoutId: string) {
    this.router.navigate(['/l/edit', layoutId]);
  }

  // Archiving frees a plan slot and takes the page offline in ez-view; the
  // item stays in `pages` and moves to the Archived section via its status.
  archivePage(pageId: string) {
    this.pagesService.archivePage(pageId).subscribe({
      next: (updated) => this.replacePage(updated),
      error: (error) => console.error('Error archiving page:', error),
    });
  }

  // Restoring re-occupies a plan slot, so the server may reject it with a 403;
  // treat that like any other at-limit case.
  restorePage(pageId: string) {
    this.pagesService.restorePage(pageId).subscribe({
      next: (updated) => this.replacePage(updated),
      error: (error) => {
        if (error?.status === 403) this.showLimitModal('page');
        else console.error('Error restoring page:', error);
      },
    });
  }

  archiveLayout(layoutId: string) {
    this.layoutsService.archiveLayout(layoutId).subscribe({
      next: (updated) => this.replaceLayout(updated),
      error: (error) => console.error('Error archiving layout:', error),
    });
  }

  restoreLayout(layoutId: string) {
    this.layoutsService.restoreLayout(layoutId).subscribe({
      next: (updated) => this.replaceLayout(updated),
      error: (error) => {
        if (error?.status === 403) this.showLimitModal('layout');
        else console.error('Error restoring layout:', error);
      },
    });
  }

  private replacePage(updated: Page) {
    this.pages = this.pages.map((p) => (p.id === updated.id ? updated : p));
    this.loadUsage();
  }

  private replaceLayout(updated: Layout) {
    this.layouts = this.layouts.map((l) => (l.id === updated.id ? updated : l));
    this.loadUsage();
  }

  openDelete(kind: ResourceKind, id: string, name: string) {
    this.deleteError = '';
    this.deleteModal = { kind, id, name };
  }

  closeDeleteModal() {
    if (this.deleting) return;
    this.deleteModal = null;
  }

  confirmDelete() {
    if (!this.deleteModal || this.deleting) return;
    const { kind, id } = this.deleteModal;
    this.deleting = true;
    this.deleteError = '';

    const onSuccess = () => {
      if (kind === 'page') {
        this.pages = this.pages.filter((p) => p.id !== id);
      } else {
        this.layouts = this.layouts.filter((l) => l.id !== id);
      }
      this.deleting = false;
      this.deleteModal = null;
      this.loadUsage();
    };

    const onError = (error: any) => {
      this.deleting = false;
      this.deleteError = 'Something went wrong. Please try again.';
      console.error(`Error deleting ${kind}:`, error);
    };

    const request =
      kind === 'page'
        ? this.pagesService.deletePage(id)
        : this.layoutsService.deleteLayout(id);
    request.subscribe({ next: onSuccess, error: onError });
  }
}
