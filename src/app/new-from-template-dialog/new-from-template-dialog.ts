import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
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
import { PagesService } from '../pages.service';
import { TemplatesService } from '../templates.service';
import { snippetThumbUrl } from '../runtime-config';
import { Layout, Page, Template, TemplateKind } from '../models';

type Choice = Template | 'blank';

export type NewKind = Extract<TemplateKind, 'page' | 'layout'>;

/** Everything that reads differently between a new page and a new layout. */
const COPY: Record<NewKind, {
  title: string;
  lede: string;
  blankName: string;
  blankMeta: string;
  blankPane: string;
  nameLabel: string;
  namePlaceholder: string;
  createLabel: string;
  noun: string;
  editRoute: string;
}> = {
  page: {
    title: 'New page',
    lede: 'Start from a ready-made page or a blank one. You can change everything later.',
    blankName: 'Blank page',
    blankMeta: 'An empty page. Add sections from the snippet drawer in the editor.',
    blankPane: 'Your page starts empty. Add sections from the snippet drawer in the editor.',
    nameLabel: 'Page name',
    namePlaceholder: 'e.g. Acme Bakery landing page',
    createLabel: 'Create page',
    noun: 'page',
    editRoute: '/p/edit',
  },
  layout: {
    title: 'New layout',
    lede: 'Start from a ready-made site or a blank one. You can change everything later.',
    blankName: 'Blank site',
    blankMeta: 'One empty page. Add a navbar, footer and sections in the editor.',
    blankPane:
      'Your site starts with one empty Home page. Add a navbar, a footer and sections from the snippet drawer in the editor.',
    nameLabel: 'Layout name',
    namePlaceholder: 'e.g. Acme Bakery site',
    createLabel: 'Create layout',
    noun: 'layout',
    editRoute: '/l/edit',
  },
};

// Page chips shown on a card while it's hovered. Past this many, a "+N" chip
// stands in for the rest; the full list is one click away in the preview.
const MAX_CARD_PAGES = 4;
// Hover pan speed through a card's page preview, and its clamp, so a short
// page doesn't jerk past and a very long one doesn't crawl.
const PAN_PX_PER_SEC = 110;
const PAN_MIN_SEC = 2;
const PAN_MAX_SEC = 9;

/**
 * "New page" / "New layout": choose a starting point, then name it. The only
 * way pages and layouts are created, from the dashboard and their own lists.
 *
 * Step one is a grid of a blank start, the org's own templates of that kind,
 * and the built-in ones. Every card previews page one as a stack of the snippet
 * thumbnails already on the assets CDN (a layout's nav, that page's sections,
 * and footer; a page template's sections), so
 * templates need no screenshot pipeline and a freshly saved template previews
 * at once. Hovering a card pans down that page and shows its page chips;
 * hovering a chip switches the card to that page.
 *
 * Picking a card opens step two: the template large, with a tab per page, next
 * to the name fields. Everything hover reveals is also here, so nothing depends
 * on a pointer.
 */
@Component({
  selector: 'app-new-from-template-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './new-from-template-dialog.html',
  styleUrl: './new-from-template-dialog.css',
})
export class NewFromTemplateDialog implements OnInit, OnDestroy {
  private templatesService = inject(TemplatesService);
  private layoutsService = inject(LayoutsService);
  private pagesService = inject(PagesService);
  private router = inject(Router);

  @Input({ required: true }) kind!: NewKind;
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

    this.templatesService.getTemplates(this.kind).subscribe({
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

  get copy() {
    return COPY[this.kind];
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
    if (this.kind === 'page') return template.snippetIds ?? [];
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
    if (this.kind === 'page') return 1;
    return Math.max(template.subPages?.length ?? 0, 1);
  }

  cardPageIndex(template: Template): number {
    return this.cardPage[template.id] ?? 0;
  }

  /** Card chips: the first few pages, then a count of the rest. */
  cardChips(template: Template): number[] {
    return Array.from({ length: Math.min(this.pageCount(template), MAX_CARD_PAGES) }, (_, i) => i);
  }

  /** Card subtitle and step-two note: "3 pages" for a layout, "5 sections" for a page. */
  sizeLabel(template: Template): string {
    const n = this.kind === 'page' ? template.snippetIds?.length ?? 0 : template.subPages?.length ?? 0;
    const unit = this.kind === 'page' ? 'section' : 'page';
    return `${n} ${unit}${n === 1 ? '' : 's'}`;
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
    const templateId = this.selected === 'blank' ? null : this.selected.id;
    let request: Observable<Page | Layout>;
    if (this.kind === 'page') {
      request = templateId
        ? this.templatesService.createPageFrom(templateId, details)
        : this.pagesService.createPage({ ...details, snippets: [] });
    } else {
      request = templateId
        ? this.templatesService.createLayoutFrom(templateId, details)
        : this.layoutsService.createLayout(details);
    }

    request.subscribe({
      next: (created) => {
        this.creating = false;
        this.router.navigate([this.copy.editRoute, created.id]);
      },
      error: (err) => {
        this.creating = false;
        if (err?.status === 403) {
          this.limitReached = true;
        } else {
          this.createError = err?.error?.message ?? `Could not create the ${this.copy.noun}. Please try again.`;
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
