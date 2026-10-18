import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

// The width the site is laid out at in "Desktop". Narrower stages scale the
// whole frame down rather than reflowing it, so the preview always looks like
// the real site on a laptop or desktop — just smaller. A stage wider than this
// renders at its own width (still a desktop layout).
const DESKTOP_WIDTH = 1280;
const MOBILE_WIDTH = 390;

// One named window shared by both editors: popping out from another editor
// (or after a reload) reuses it rather than opening a second one.
const POPUP_NAME = 'ez-preview';
const POPUP_FEATURES = 'popup=yes,width=1440,height=900';
// Per-viewer convenience: someone who works with the preview on a second
// screen gets the wide structure view back on their next visit.
const POPOUT_STORAGE_KEY = 'ez.editor.previewPoppedOut';
// How often to check whether the preview window was closed (there's no event
// for that on a cross-origin window).
const POPUP_POLL_MS = 1000;

/**
 * The editors' live preview: an iframe of the public ez-view render.
 *
 * `src` is the render URL; bump `version` after an edit to reload it (a
 * cache-busting param — the frame is cross-origin, so it can't be told to
 * reload directly).
 *
 * It can pop out into its own window (for a second screen). The editor then
 * gets `poppedOutChange(true)` and gives the room to the structure; the window
 * keeps following `src`/`version`, and closing it brings the inline preview
 * back. While popped out, the component shrinks to a one-line note.
 *
 * Use with the card classes from the editor stylesheet:
 *   <app-editor-preview class="card preview-card" [src]="…" [version]="…" />
 */
@Component({
  selector: 'app-editor-preview',
  imports: [CommonModule],
  templateUrl: './editor-preview.html',
  host: { '[class.popped]': 'poppedOut' },
  styleUrls: ['./editor-tokens.css', './editor-preview.css'],
})
export class EditorPreview implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  private sanitizer = inject(DomSanitizer);
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

  @Input({ required: true }) src!: string;
  @Input() version = 0;
  /** Shown after the heading, e.g. the open subpage's name. */
  @Input() label = '';
  @Input() frameTitle = 'Preview';

  /** True while the preview lives in its own window (or should, after a reload). */
  @Output() poppedOutChange = new EventEmitter<boolean>();

  @ViewChild('stage') stageRef?: ElementRef<HTMLElement>;

  device: 'desktop' | 'mobile' = 'desktop';
  safeUrl: SafeResourceUrl | null = null;
  /** The URL actually loaded, cache-buster included. */
  currentUrl = '';

  // Frame geometry, recomputed whenever the stage resizes.
  frameWidth = DESKTOP_WIDTH;
  stageHeight = 0;
  scale = 1;

  /** The preview belongs in its own window (the editor's wide view). */
  poppedOut = false;
  /** That window is open and being kept in sync. */
  windowLive = false;
  /** The browser refused to open the window (pop-up blocker). */
  popupBlocked = false;

  private localVersion = 0;
  private resizeObserver?: ResizeObserver;
  private popup: Window | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    // Restore the wide view, but not the window: opening one needs a click.
    try {
      this.poppedOut = localStorage.getItem(POPOUT_STORAGE_KEY) === '1';
    } catch {
      // Storage blocked — start inline.
    }
    if (this.poppedOut) this.poppedOutChange.emit(true);
  }

  ngOnChanges() {
    this.updateUrl();
  }

  ngAfterViewInit() {
    const stage = this.stageRef?.nativeElement;
    if (!stage) return;
    // Resize callbacks fire outside Angular's zone; only re-enter it when the
    // geometry actually changed.
    this.zone.runOutsideAngular(() => {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.measure()) this.zone.run(() => this.cdr.markForCheck());
      });
      this.resizeObserver.observe(stage);
    });
    this.measure();
    this.cdr.detectChanges();
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    // Leave the window open — the next editor reuses it by name — but stop
    // watching it.
    this.stopPolling();
  }

  /** Open (or reconnect to) the preview window. Must run from a click. */
  popOut() {
    this.popup = window.open(this.currentUrl, POPUP_NAME, POPUP_FEATURES);
    // Blocked: stay where we are and say why, rather than doing nothing.
    this.popupBlocked = !this.popup;
    if (!this.popup) return;
    this.popup.focus();
    this.windowLive = true;
    this.setPoppedOut(true);
    this.startPolling();
  }

  focusWindow() {
    this.popup?.focus();
  }

  /** Close the window and show the preview inline again. */
  bringBack() {
    this.stopPolling();
    if (this.popup && !this.popup.closed) this.popup.close();
    this.popup = null;
    this.windowLive = false;
    this.setPoppedOut(false);
    // The stage was hidden, so its size is stale.
    setTimeout(() => this.measure() && this.cdr.markForCheck());
  }

  private setPoppedOut(value: boolean) {
    if (this.poppedOut === value) return;
    this.poppedOut = value;
    try {
      localStorage.setItem(POPOUT_STORAGE_KEY, value ? '1' : '0');
    } catch {
      // Storage blocked — the choice just won't stick.
    }
    this.poppedOutChange.emit(value);
  }

  private startPolling() {
    this.stopPolling();
    this.zone.runOutsideAngular(() => {
      this.pollTimer = setInterval(() => {
        if (this.popup && !this.popup.closed) return;
        // The user closed the window: the preview comes back inline.
        this.zone.run(() => this.bringBack());
      }, POPUP_POLL_MS);
    });
  }

  private stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  setDevice(device: 'desktop' | 'mobile') {
    this.device = device;
    this.measure();
  }

  refresh() {
    this.localVersion += 1;
    this.updateUrl();
  }

  openInNewTab() {
    window.open(this.src, '_blank');
  }

  get scalePercent(): number {
    return Math.round(this.scale * 100);
  }

  private updateUrl() {
    if (!this.src) return;
    const sep = this.src.includes('?') ? '&' : '?';
    this.currentUrl = `${this.src}${sep}_=${this.version}.${this.localVersion}`;
    this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.currentUrl);
    // Keep the popped-out window in step. Navigating a window this page opened
    // is allowed even though it's on another origin; replace() keeps its
    // back button from filling up with every edit.
    if (this.popup && !this.popup.closed) this.popup.location.replace(this.currentUrl);
  }

  /** Returns true when the frame geometry changed. */
  private measure(): boolean {
    const stage = this.stageRef?.nativeElement;
    if (!stage) return false;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return false;

    const target = this.device === 'mobile' ? MOBILE_WIDTH : Math.max(DESKTOP_WIDTH, width);
    const scale = Math.min(1, width / target);
    const changed =
      target !== this.frameWidth || height !== this.stageHeight || scale !== this.scale;
    this.frameWidth = target;
    this.stageHeight = height;
    this.scale = scale;
    return changed;
  }
}
