import { Component, HostListener, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  CdkMenu,
  CdkMenuGroup,
  CdkMenuItem,
  CdkMenuItemRadio,
  CdkMenuTrigger,
} from '@angular/cdk/menu';
import { OverflowMenu } from '../overflow-menu/overflow-menu';
import { PagesService } from '../pages.service';
import { LayoutsService } from '../layouts.service';
import { PlansService, PlanUsage } from '../plans.service';
import { AuthService } from '../auth.service';
import { runtimeConfig } from '../runtime-config';
import { Page, Layout } from '../models';
import { ShareLinkService } from '../share-link.service';
import { CreatorLabelsService } from '../creator-labels.service';

const PLACEHOLDER_THUMBNAIL = '/card-placeholder.svg';

type ResourceKind = 'page' | 'layout';

type SortKey = 'updated' | 'created' | 'name';

const SORT_LABELS: Record<SortKey, string> = {
  updated: 'Recently edited',
  created: 'Recently created',
  name: 'Name A–Z',
};

// Per-viewer convenience only — losing it just falls back to the default.
const SORT_STORAGE_KEY = 'ez.dashboard.sort';

// Each section has its own search, sort and creator filter. These only narrow
// or reorder what its grid shows — count badges and plan-limit checks keep
// using activePages/activeLayouts. `creator` holds a creator label ('you', an
// email, 'a former member') rather than a user id, so all former members
// collapse into one option.
interface SectionView {
  query: string;
  searchOpen: boolean;
  sort: SortKey;
  creator: string;
}

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
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    OverflowMenu,
    CdkMenu,
    CdkMenuGroup,
    CdkMenuItem,
    CdkMenuItemRadio,
    CdkMenuTrigger,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  private pagesService = inject(PagesService);
  private shareLinks = inject(ShareLinkService);
  private layoutsService = inject(LayoutsService);
  private plansService = inject(PlansService);
  private authService = inject(AuthService);
  private router = inject(Router);
  readonly creators = inject(CreatorLabelsService);

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

  readonly sortKeys = Object.keys(SORT_LABELS) as SortKey[];
  readonly sortLabels = SORT_LABELS;

  view: Record<ResourceKind, SectionView> = {
    layout: { query: '', searchOpen: false, sort: 'updated', creator: '' },
    page: { query: '', searchOpen: false, sort: 'updated', creator: '' },
  };

  ngOnInit() {
    this.restoreSorts();
    this.creators.load();
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

  get shownActivePages(): Page[] {
    return this.shown(this.activePages, 'page');
  }

  get shownArchivedPages(): Page[] {
    return this.shown(this.archivedPages, 'page');
  }

  get shownActiveLayouts(): Layout[] {
    return this.shown(this.activeLayouts, 'layout');
  }

  get shownArchivedLayouts(): Layout[] {
    return this.shown(this.archivedLayouts, 'layout');
  }

  filtering(kind: ResourceKind): boolean {
    const v = this.view[kind];
    return !!v.query.trim() || !!v.creator;
  }

  clearFilters(kind: ResourceKind) {
    this.view[kind].query = '';
    this.view[kind].creator = '';
    this.view[kind].searchOpen = false;
  }

  // Creators that own something in this section, "you" first. Empty outside
  // team workspaces (labelFor returns null there), which hides that menu group.
  creatorOptions(kind: ResourceKind): string[] {
    const items: (Page | Layout)[] = kind === 'page' ? this.pages : this.layouts;
    const labels = new Set<string>();
    for (const item of items) {
      const label = this.creators.labelFor(item.createdBy);
      if (label) labels.add(label);
    }
    return [...labels].sort((a, b) =>
      a === 'you' ? -1 : b === 'you' ? 1 : a.localeCompare(b),
    );
  }

  creatorLabel(label: string): string {
    return label === 'you' ? 'You' : label;
  }

  setSort(kind: ResourceKind, sort: SortKey) {
    this.view[kind].sort = sort;
    try {
      localStorage.setItem(
        SORT_STORAGE_KEY,
        JSON.stringify({ layout: this.view.layout.sort, page: this.view.page.sort }),
      );
    } catch {
      // Storage blocked (private window etc.) — the choice just won't stick.
    }
  }

  private restoreSorts() {
    try {
      const saved = JSON.parse(localStorage.getItem(SORT_STORAGE_KEY) ?? '{}');
      for (const kind of ['layout', 'page'] as ResourceKind[]) {
        if (saved[kind] in SORT_LABELS) this.view[kind].sort = saved[kind];
      }
    } catch {
      // Missing or unreadable — keep the defaults.
    }
  }

  // The search box sits collapsed behind its icon. The icon's mousedown is
  // prevented in the template so clicking it doesn't blur (and so close) the
  // input first.
  toggleSearch(kind: ResourceKind, input: HTMLInputElement) {
    const v = this.view[kind];
    if (v.searchOpen && !v.query) {
      v.searchOpen = false;
      return;
    }
    v.searchOpen = true;
    // Zero width doesn't stop focus, so this works before .open is applied.
    input.focus();
  }

  // Click away with an empty box collapses it; with text it stays open so the
  // active filter stays visible.
  onSearchBlur(kind: ResourceKind) {
    if (!this.view[kind].query) this.view[kind].searchOpen = false;
  }

  closeSearch(kind: ResourceKind, input: HTMLInputElement) {
    this.view[kind].query = '';
    this.view[kind].searchOpen = false;
    input.blur();
  }

  // "/" jumps to the pages search — the section most likely to be long —
  // unless the user is already typing somewhere or a modal is open.
  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (this.createModal || this.limitModal || this.deleteModal) return;
    const input = document.querySelector<HTMLInputElement>('#page-search');
    if (!input) return;
    event.preventDefault();
    this.view.page.searchOpen = true;
    input.focus();
  }

  private shown<T extends Page | Layout>(items: T[], kind: ResourceKind): T[] {
    const v = this.view[kind];
    const terms = v.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return items
      .filter((item) => this.matches(item, terms, v.creator))
      .sort(this.comparator(v.sort));
  }

  // Every whitespace-separated term must appear somewhere in the item's text
  // fields, case-insensitively — "harbor menu" finds "Harbor & Pine — Menu".
  private matches(item: Page | Layout, terms: string[], creator: string): boolean {
    if (creator && this.creators.labelFor(item.createdBy) !== creator) return false;
    if (!terms.length) return true;
    const text = [item.name, item.siteName, item.description, item.slug]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return terms.every((t) => text.includes(t));
  }

  // Dates are ISO strings, so they compare correctly as strings. Newest first;
  // an item missing updatedAt falls back to createdAt.
  private comparator(sort: SortKey): (a: Page | Layout, b: Page | Layout) => number {
    switch (sort) {
      case 'name':
        return (a, b) =>
          (a.name ?? '').localeCompare(b.name ?? '', undefined, {
            numeric: true,
            sensitivity: 'base',
          });
      case 'created':
        return (a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
      case 'updated':
        return (a, b) =>
          (b.updatedAt ?? b.createdAt ?? '').localeCompare(a.updatedAt ?? a.createdAt ?? '');
    }
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

  viewPage(page: Page) {
    window.open(this.shareLinks.pageUrl(page.id, page.slug), '_blank');
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

  viewLayout(layout: Layout) {
    window.open(this.shareLinks.layoutUrl(layout.id, layout.slug), '_blank');
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
