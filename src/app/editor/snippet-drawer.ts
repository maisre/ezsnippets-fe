import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { OrgsService } from '../orgs.service';
import { snippetThumbUrl } from '../runtime-config';
import { SnippetFilters, SnippetOverride } from '../models';

export type DrawerTab = 'snippets' | 'templates' | 'scratchpad';

/** Drop-list id of the palette, for editors deciding how to handle a drop. */
export const PALETTE_LIST_ID = 'snippet-palette';

// Per-viewer convenience only; losing it just means starting unpinned.
const PIN_STORAGE_KEY = 'ez.editor.drawerPinned';

// Hovering the edge tab opens the drawer after this long, so a cursor passing
// over it on the way somewhere else doesn't fling it open.
const HOVER_OPEN_MS = 150;
// Leaving a hover-opened drawer closes it after this long, so a brief overshoot
// while aiming at a tile doesn't snap it shut.
const HOVER_CLOSE_MS = 350;

/**
 * The snippet library both editors drag and click from.
 *
 * Three ways to have it: a tab on the right edge that slides the drawer in on
 * hover (and back out when the cursor leaves), an explicit open from an "Add"
 * button that stays until closed, or pinned — docked as a third column of the
 * editor so it never covers the preview.
 *
 * It owns the library view (type/tag/favorites filters, starring); each editor
 * projects its own Templates and Scratch pad tab contents, because applying a
 * template or restoring a parked snippet means different things on a page and
 * on a layout:
 *
 *   <app-snippet-drawer ...>
 *     <div drawerTemplates>…</div>
 *     <div drawerScratch>…</div>
 *   </app-snippet-drawer>
 *
 * Tiles are cdkDrag items in a drop list with id PALETTE_LIST_ID, connected to
 * whatever lists the editor passes in `connectedTo`. Dropping copies: the
 * editor inserts `event.item.data` and leaves the palette alone.
 */
@Component({
  selector: 'app-snippet-drawer',
  imports: [CommonModule, DragDropModule],
  templateUrl: './snippet-drawer.html',
  styleUrls: ['./editor-tokens.css', './snippet-drawer.css'],
})
export class SnippetDrawer implements OnInit, OnChanges, OnDestroy {
  private orgsService = inject(OrgsService);
  private host = inject(ElementRef<HTMLElement>);

  /** The library to show (the editor loads it; it also hydrates its rows). */
  @Input() snippets: SnippetOverride[] = [];
  @Input() filters: SnippetFilters = { types: [], tags: [] };
  @Input() title = 'Add a snippet';
  @Input() subtitle = 'Click or drag a snippet onto the page';
  /** Hide the Templates / Scratch pad tabs (e.g. when choosing a navbar). */
  @Input() showTabs = true;
  @Input() scratchCount = 0;
  /** Label revealed on tile hover: "+ Add", "Use", … */
  @Input() addLabel = '+ Add';
  /** Drop-list ids the tiles can be dragged into. */
  @Input() connectedTo: string[] = [];
  /**
   * Show only this snippet type, with the Type filter hidden — e.g. headers
   * while choosing a navbar. Null shows the whole library.
   */
  @Input() lockedType: string | null = null;

  @Output() picked = new EventEmitter<SnippetOverride>();
  @Output() pinnedChange = new EventEmitter<boolean>();
  /** The drawer went away (or, pinned, finished a one-off "choose a …"). */
  @Output() closed = new EventEmitter<void>();

  readonly paletteId = PALETTE_LIST_ID;
  readonly snippetThumbUrl = snippetThumbUrl;

  state: 'closed' | 'hover' | 'open' = 'closed';
  pinned = false;
  tab: DrawerTab = 'snippets';
  dragging = false;

  activeTypeFilter = '';
  activeTagFilter = '';
  showFavoritesOnly = false;
  favoriteIds = new Set<string>();
  favoritesError: string | null = null;

  private openTimer: ReturnType<typeof setTimeout> | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  // True while the pointer is over the drawer, so a drag that ends inside it
  // doesn't start the close timer.
  private pointerInside = false;

  ngOnInit() {
    try {
      this.pinned = localStorage.getItem(PIN_STORAGE_KEY) === '1';
    } catch {
      // Storage blocked — start unpinned.
    }
    if (this.pinned) this.pinnedChange.emit(true);
    this.loadFavorites();
  }

  ngOnDestroy() {
    this.clearTimers();
  }

  get visible(): boolean {
    return this.pinned || this.state !== 'closed';
  }

  // Cached rather than a getter: the library is ~1,600 snippets and the drop
  // list shouldn't see a new array on every change-detection pass.
  filtered: SnippetOverride[] = [];

  ngOnChanges() {
    this.refilter();
  }

  private refilter() {
    const type = this.lockedType || this.activeTypeFilter;
    this.filtered = this.snippets.filter((s) => {
      if (this.showFavoritesOnly && !this.favoriteIds.has(s.id)) return false;
      if (type && s.type !== type) return false;
      if (this.activeTagFilter && !(s.tags || []).includes(this.activeTagFilter)) return false;
      return true;
    });
  }

  // --- Opening and closing -------------------------------------------------

  /** Open explicitly (from an "Add" or "Change" button): stays until closed. */
  open(opts: { tab?: DrawerTab } = {}) {
    this.clearTimers();
    if (opts.tab) this.tab = opts.tab;
    if (!this.pinned) this.state = 'open';
  }

  close() {
    this.clearTimers();
    this.state = 'closed';
    this.closed.emit();
  }

  togglePin() {
    this.pinned = !this.pinned;
    this.state = this.pinned ? 'closed' : 'open';
    try {
      localStorage.setItem(PIN_STORAGE_KEY, this.pinned ? '1' : '0');
    } catch {
      // Storage blocked — the choice just won't stick.
    }
    this.pinnedChange.emit(this.pinned);
  }

  onEdgeEnter() {
    if (this.visible) return;
    this.clearTimers();
    this.openTimer = setTimeout(() => (this.state = 'hover'), HOVER_OPEN_MS);
  }

  onEdgeLeave() {
    if (this.openTimer) clearTimeout(this.openTimer);
    this.openTimer = null;
  }

  onEdgeClick() {
    this.open();
  }

  onDrawerEnter() {
    this.pointerInside = true;
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = null;
  }

  onDrawerLeave() {
    this.pointerInside = false;
    this.scheduleHoverClose();
  }

  onDragStarted() {
    this.dragging = true;
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = null;
  }

  onDragEnded() {
    this.dragging = false;
    if (!this.pointerInside) this.scheduleHoverClose();
  }

  // Only a hover-opened drawer closes itself, and never mid-drag.
  private scheduleHoverClose() {
    if (this.state !== 'hover' || this.dragging) return;
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => {
      if (this.state === 'hover' && !this.dragging) this.close();
    }, HOVER_CLOSE_MS);
  }

  private clearTimers() {
    if (this.openTimer) clearTimeout(this.openTimer);
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.openTimer = this.closeTimer = null;
  }

  // An explicitly opened drawer closes on a click elsewhere — except on the
  // buttons that open it (marked data-drawer-trigger), which would otherwise
  // close it on the same click, and on overlay menus spawned from inside it.
  @HostListener('document:mousedown', ['$event'])
  onDocumentMousedown(event: MouseEvent) {
    if (this.state !== 'open' || this.pinned || this.dragging) return;
    const target = event.target as HTMLElement | null;
    if (!target || this.host.nativeElement.contains(target)) return;
    if (target.closest('[data-drawer-trigger], .cdk-overlay-container')) return;
    this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (!this.pinned && this.state !== 'closed') this.close();
  }

  // --- Library filters -----------------------------------------------------

  setTab(tab: DrawerTab) {
    this.tab = tab;
  }

  setTypeFilter(type: string) {
    this.activeTypeFilter = this.activeTypeFilter === type ? '' : type;
    this.refilter();
  }

  setTagFilter(tag: string) {
    this.activeTagFilter = this.activeTagFilter === tag ? '' : tag;
    this.refilter();
  }

  toggleFavoritesFilter() {
    this.showFavoritesOnly = !this.showFavoritesOnly;
    this.refilter();
  }

  clearFilters() {
    this.activeTypeFilter = '';
    this.activeTagFilter = '';
    this.showFavoritesOnly = false;
    this.refilter();
  }

  // --- Favorites -----------------------------------------------------------
  //
  // Org-wide, and a view of the library rather than a separate collection —
  // hence a filter chip beside type and tags.

  private loadFavorites() {
    this.orgsService.listFavorites().subscribe({
      next: ({ favorites }) => this.setFavorites(favorites.map((f) => f.snippetId)),
      // Not worth interrupting the editor for; nothing shows as starred.
      error: () => {},
    });
  }

  private setFavorites(ids: string[]) {
    this.favoriteIds = new Set(ids);
    if (this.showFavoritesOnly) this.refilter();
  }

  isFavorite(snippetId: string): boolean {
    return this.favoriteIds.has(snippetId);
  }

  // `Event`, not `MouseEvent`: the star is keyboard-reachable too. The star
  // sits on a tile that adds the snippet, hence stopPropagation.
  toggleFavorite(snippetId: string, event: Event) {
    event.stopPropagation();
    const wasFavorite = this.favoriteIds.has(snippetId);
    // Flip locally first so the star responds immediately; the response
    // replaces the whole set either way.
    if (wasFavorite) this.favoriteIds.delete(snippetId);
    else this.favoriteIds.add(snippetId);
    if (this.showFavoritesOnly) this.refilter();
    this.favoritesError = null;

    const request = wasFavorite
      ? this.orgsService.removeFavorite(snippetId)
      : this.orgsService.addFavorite(snippetId);
    request.subscribe({
      next: ({ favorites }) => this.setFavorites(favorites.map((f) => f.snippetId)),
      error: (err) => {
        if (wasFavorite) this.favoriteIds.add(snippetId);
        else this.favoriteIds.delete(snippetId);
        if (this.showFavoritesOnly) this.refilter();
        this.favoritesError = err?.error?.message ?? 'Could not update favorites.';
      },
    });
  }

  trackById(index: number, snippet: SnippetOverride): string {
    return snippet.id || String(index);
  }

  // Nothing can be dropped back into the library.
  readonly noEntry = () => false;
}
