import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TemplatesService } from '../templates.service';
import { CreateTemplateDto, Template, TemplateKind } from '../models';

/**
 * "Save as template" modal.
 *
 * The caller supplies the snippet ids — this component never reads content off
 * a page, which keeps the "templates are blank" rule visible at the call site
 * rather than buried in here.
 */
@Component({
  selector: 'app-save-template-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './save-template-dialog.html',
  styleUrl: './save-template-dialog.css',
})
export class SaveTemplateDialog {
  private templatesService = inject(TemplatesService);

  /** 'partial' and 'page' pass snippetIds; 'layout' passes nav/footer/subPages. */
  @Input() kind: TemplateKind = 'page';
  @Input() snippetIds: string[] = [];
  @Input() nav?: string;
  @Input() footer?: string;
  @Input() subPages: Array<{ name: string; snippetIds: string[] }> = [];
  @Input() suggestedName = '';

  @Output() saved = new EventEmitter<Template>();
  @Output() closed = new EventEmitter<void>();

  name = '';
  description = '';
  type = '';
  tagsInput = '';

  saving = false;
  error: string | null = null;

  ngOnChanges() {
    if (!this.name && this.suggestedName) this.name = this.suggestedName;
  }

  get count(): number {
    if (this.kind !== 'layout') return this.snippetIds.length;
    let total = (this.nav ? 1 : 0) + (this.footer ? 1 : 0);
    for (const sp of this.subPages) total += sp.snippetIds.length;
    return total;
  }

  get canSave(): boolean {
    return !!this.name.trim() && this.count > 0 && !this.saving;
  }

  save() {
    if (!this.canSave) return;
    this.saving = true;
    this.error = null;

    const dto: CreateTemplateDto = {
      name: this.name.trim(),
      description: this.description.trim() || undefined,
      kind: this.kind,
      type: this.type.trim() || undefined,
      tags: this.tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };

    if (this.kind === 'layout') {
      dto.nav = this.nav;
      dto.footer = this.footer;
      dto.subPages = this.subPages;
    } else {
      dto.snippetIds = this.snippetIds;
    }

    this.templatesService.saveTemplate(dto).subscribe({
      next: (template) => {
        this.saving = false;
        this.reset();
        this.saved.emit(template);
      },
      error: (err) => {
        this.saving = false;
        // The server's message carries the plan reason on a 403, which is more
        // useful than a generic failure line.
        this.error =
          err?.error?.message ?? 'Could not save the template. Try again.';
      },
    });
  }

  close() {
    this.reset();
    this.closed.emit();
  }

  private reset() {
    this.name = '';
    this.description = '';
    this.type = '';
    this.tagsInput = '';
    this.error = null;
  }
}
