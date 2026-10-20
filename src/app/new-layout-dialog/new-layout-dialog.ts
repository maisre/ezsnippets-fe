import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { LayoutsService } from '../layouts.service';
import { TemplatesService } from '../templates.service';
import { snippetThumbUrl } from '../runtime-config';
import { Layout, Template } from '../models';

type Choice = Template | 'blank';

// Page chips shown on a card while it's hovered. Past this many, a "+N" chip
// stands in for the rest; the full list is one click away in the preview.
const MAX_CARD_PAGES = 4;
// Hover pan speed through a card's page preview, and its clamp, so a short
// page doesn't jerk past and a very long one doesn't crawl.
const PAN_PX_PER_SEC = 110;
const PAN_MIN_SEC = 2;
const PAN_MAX_SEC = 9;

/**
 * "New layout": choose a starting point, then name the site.
 *
 * Step one is a grid of a blank site, the org's own layout templates, and the
 * built-in ones. Every card previews page one as a stack of the snippet
 * thumbnails already on the assets CDN (nav, that page's sections, footer), so
 * templates need no screenshot pipeline and a freshly saved template previews
 * at once. Hovering a card pans down that page and shows its page chips;
 * hovering a chip switches the card to that page.
 *
 * Picking a card opens step two: the template large, with a tab per page, next
 * to the name fields. Everything hover reveals is also here, so nothing depends
 * on a pointer.
 */
@Component({
  selector: 'app-new-layout-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './new-layout-dialog.html',
  styleUrl: './new-layout-dialog.css',
})
export class NewLayoutDialog implements OnInit, OnDestroy {
  private templatesService = inject(TemplatesService);
  private layoutsService = inject(LayoutsService);
  private router = inject(Router);

  @Output() closed = new EventEmitter<void>();

  @ViewChild('dialog', { static: true }) dialogRef!: ElementRef<HTMLElement>;

  readonly maxCardPages = MAX_CARD_PAGES;
  readonly thumb = snippetThumbUrl;

  templates: Template[] = [];
  loading = true;
  loadError: string | null = null;

  /** null while choosing; set once a card is picked. */
  selected: Choice | null = null;
  /** Page shown in the step-two preview. */
  activePage = 0;
  /** Page each card is showing, keyed by template id (hovering a chip changes it). */
  cardPage: Record<string, number> = {};

  form = { name: '', siteName: '', description: '' };
  creating = false;
  createError: string | null = null;
  limitReached = false;

  confirmingDelete = false;
  deleting = false;

  private previousOverflow = '';

  ngOnInit() {
    // The page behind shouldn't scroll under the modal.
    this.previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.dialogRef.nativeElement.focus();

    this.templatesService.getTemplates('layout').subscribe({
      next: (templates) => {
        this.templates = templates;
        this.loading = false;
      },
      error: () => {
        this.loadError = 'Could not load templates. You can still start from a blank site.';
        this.loading = false;
      },
    });
  }

  ngOnDestroy() {
    document.body.style.overflow = this.previousOverflow;
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.confirmingDelete) this.confirmingDelete = false;
    else this.close();
  }

  close() {
    if (this.creating) return;
    this.closed.emit();
  }

  get ownTemplates(): Template[] {
    return this.templates.filter((t) => !!t.org);
  }

  get libraryTemplates(): Template[] {
    return this.templates.filter((t) => !t.org);
  }

  get selectedTemplate(): Template | null {
    return this.selected && this.selected !== 'blank' ? this.selected : null;
  }

  // ----- step one -----

  choose(choice: Choice) {
    this.selected = choice;
    this.activePage = 0;
    this.createError = null;
    this.limitReached = false;
    this.confirmingDelete = false;
    this.form = {
      name: choice === 'blank' ? '' : choice.name,
      siteName: '',
      description: '',
    };
    // Land in the name field, with the template's name selected so typing replaces it.
    setTimeout(() => {
      const input = this.dialogRef.nativeElement.querySelector<HTMLInputElement>('#nl-name');
      input?.focus();
      input?.select();
    });
  }

  back() {
    if (this.creating) return;
    this.selected = null;
    this.confirmingDelete = false;
  }

  /** Snippet ids that make up one page of a template, top to bottom. */
  pageIds(template: Template, index: number): string[] {
    const page = template.subPages?.[index];
    return [
      ...(template.nav ? [template.nav] : []),
      ...(page?.snippetIds ?? []),
      ...(template.footer ? [template.footer] : []),
    ];
  }

  pageName(template: Template, index: number): string {
    return template.subPages?.[index]?.name || `Page ${index + 1}`;
  }

  pageCount(template: Template): number {
    return Math.max(template.subPages?.length ?? 0, 1);
  }

  cardPageIndex(template: Template): number {
    return this.cardPage[template.id] ?? 0;
  }

  /** Card chips: the first few pages, then a count of the rest. */
  cardChips(template: Template): number[] {
    return Array.from({ length: Math.min(this.pageCount(template), MAX_CARD_PAGES) }, (_, i) => i);
  }

  hiddenPageCount(template: Template): number {
    return Math.max(this.pageCount(template) - MAX_CARD_PAGES, 0);
  }

  showCardPage(template: Template, index: number, viewport: HTMLElement) {
    if (this.cardPageIndex(template) === index) return;
    this.cardPage = { ...this.cardPage, [template.id]: index };
    // The new page's images render next tick; restart the pan once they have.
    this.stopPan(viewport);
    setTimeout(() => this.startPan(viewport), 0);
  }

  /** Pan the card's page preview from top to bottom while it's hovered or focused. */
  startPan(viewport: HTMLElement) {
    const stack = viewport.querySelector<HTMLElement>('.page-stack');
    if (!stack || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const distance = stack.scrollHeight - viewport.clientHeight;
    if (distance <= 0) return;
    const seconds = Math.min(Math.max(distance / PAN_PX_PER_SEC, PAN_MIN_SEC), PAN_MAX_SEC);
    stack.style.transition = `transform ${seconds}s ease-in-out 0.25s`;
    stack.style.transform = `translateY(-${distance}px)`;
  }

  stopPan(viewport: HTMLElement) {
    const stack = viewport.querySelector<HTMLElement>('.page-stack');
    if (!stack) return;
    stack.style.transition = 'transform 0.35s ease-out';
    stack.style.transform = 'translateY(0)';
  }

  /** Leaving a card puts it back on page one, panned to the top. */
  resetCard(template: Template, viewport: HTMLElement) {
    this.stopPan(viewport);
    if (this.cardPageIndex(template) !== 0) {
      this.cardPage = { ...this.cardPage, [template.id]: 0 };
    }
  }

  onThumbError(event: Event) {
    // A snippet with no captured preview shouldn't leave a broken-image icon.
    (event.target as HTMLImageElement).style.display = 'none';
  }

  // ----- step two -----

  create() {
    const name = this.form.name.trim();
    if (!name || this.creating || !this.selected) return;
    this.creating = true;
    this.createError = null;
    this.limitReached = false;

    const details = {
      name,
      siteName: this.form.siteName.trim() || undefined,
      description: this.form.description.trim() || undefined,
    };
    const request: Observable<Layout> =
      this.selected === 'blank'
        ? this.layoutsService.createLayout(details)
        : this.templatesService.createLayoutFrom(this.selected.id, details);

    request.subscribe({
      next: (layout) => {
        this.creating = false;
        this.router.navigate(['/l/edit', layout.id]);
      },
      error: (err) => {
        this.creating = false;
        if (err?.status === 403) {
          this.limitReached = true;
        } else {
          this.createError = err?.error?.message ?? 'Could not create the layout. Please try again.';
        }
      },
    });
  }

  deleteSelected() {
    const template = this.selectedTemplate;
    if (!template || this.deleting) return;
    this.deleting = true;
    this.templatesService.deleteTemplate(template.id).subscribe({
      next: () => {
        this.deleting = false;
        this.templates = this.templates.filter((t) => t.id !== template.id);
        this.back();
      },
      error: () => {
        this.deleting = false;
        this.confirmingDelete = false;
        this.createError = 'Could not delete that template.';
      },
    });
  }
}
