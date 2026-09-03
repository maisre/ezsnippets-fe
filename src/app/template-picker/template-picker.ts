import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TemplatesService } from '../templates.service';
import { snippetThumbUrl } from '../runtime-config';
import { Template, TemplateKind } from '../models';

/**
 * Grid of templates to pick from, shared by the page list, the layout list and
 * the editor palette.
 *
 * Previews are built from the snippet thumbnails already on the assets CDN —
 * a template is only a list of snippet ids, so its card is a stack of those
 * ids' images. There is no template screenshot pipeline and no need for one.
 */
@Component({
  selector: 'app-template-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './template-picker.html',
  styleUrl: './template-picker.css',
})
export class TemplatePicker implements OnInit {
  private templatesService = inject(TemplatesService);

  /** Which kind to offer. Omit to show every kind. */
  @Input() kind?: TemplateKind;
  /**
   * Show several kinds at once — the editor palette offers partials and whole
   * pages together, since from the user's side they're the same gesture with
   * different amounts of content.
   */
  @Input() kinds?: TemplateKind[];
  /** Label on each card's action button. */
  @Input() actionLabel = 'Use';
  @Input() showOwnedOnly = false;

  @Output() picked = new EventEmitter<Template>();
  @Output() deleted = new EventEmitter<Template>();

  templates: Template[] = [];
  loading = true;
  error: string | null = null;

  typeFilter = '';
  search = '';

  snippetThumbUrl = snippetThumbUrl;

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    // With several kinds the server filter can't help, so fetch and narrow here.
    const query = this.kinds?.length ? undefined : this.kind;
    this.templatesService.getTemplates(query).subscribe({
      next: (templates) => {
        let visible = this.kinds?.length
          ? templates.filter((t) => this.kinds!.includes(t.kind))
          : templates;
        this.templates = this.showOwnedOnly
          ? visible.filter((t) => !!t.org)
          : visible;
        this.loading = false;
      },
      error: () => {
        this.error = 'Could not load templates.';
        this.loading = false;
      },
    });
  }

  get types(): string[] {
    return [...new Set(this.templates.map((t) => t.type).filter(Boolean))]
      .map(String)
      .sort();
  }

  get visible(): Template[] {
    const term = this.search.trim().toLowerCase();
    return this.templates.filter((t) => {
      if (this.typeFilter && t.type !== this.typeFilter) return false;
      if (!term) return true;
      return (
        t.name.toLowerCase().includes(term) ||
        (t.description ?? '').toLowerCase().includes(term) ||
        (t.tags ?? []).some((tag) => tag.toLowerCase().includes(term))
      );
    });
  }

  /**
   * The snippet ids to show as a preview stack. Capped so a long template
   * doesn't turn its card into a scroll region — the count badge carries the
   * rest.
   */
  previewIds(template: Template): string[] {
    return this.allIds(template).slice(0, 4);
  }

  snippetCount(template: Template): number {
    return this.allIds(template).length;
  }

  /** Layout templates say how many pages they come with; that's the real size. */
  subPageCount(template: Template): number {
    return template.kind === 'layout' ? (template.subPages ?? []).length : 0;
  }

  isOwned(template: Template): boolean {
    return !!template.org;
  }

  onThumbError(event: Event) {
    // A snippet with no captured preview shouldn't leave a broken-image icon.
    (event.target as HTMLImageElement).style.visibility = 'hidden';
  }

  private allIds(template: Template): string[] {
    if (template.kind !== 'layout') return template.snippetIds ?? [];
    const ids: string[] = [];
    if (template.nav) ids.push(template.nav);
    for (const sp of template.subPages ?? []) ids.push(...(sp.snippetIds ?? []));
    if (template.footer) ids.push(template.footer);
    return ids;
  }
}
