import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { runtimeConfig } from './runtime-config';
import {
  CreateTemplateDto,
  Layout,
  Page,
  Template,
  TemplateFilters,
  TemplateKind,
} from './models';

@Injectable({ providedIn: 'root' })
export class TemplatesService {
  private http = inject(HttpClient);

  /** Built-in library templates plus the ones this org saved. */
  getTemplates(kind?: TemplateKind): Observable<Template[]> {
    const query = kind ? `?kind=${kind}` : '';
    return this.http.get<Template[]>(
      `${runtimeConfig.apiUrl}/templates${query}`,
    );
  }

  getFilters(): Observable<TemplateFilters> {
    return this.http.get<TemplateFilters>(
      `${runtimeConfig.apiUrl}/templates/filters`,
    );
  }

  /** Fails with 403 on a plan with no saved-template allowance. */
  saveTemplate(template: CreateTemplateDto): Observable<Template> {
    return this.http.post<Template>(
      `${runtimeConfig.apiUrl}/templates`,
      template,
    );
  }

  deleteTemplate(id: string): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(
      `${runtimeConfig.apiUrl}/templates/${id}`,
    );
  }

  createPageFrom(
    templateId: string,
    details: { name?: string; siteName?: string; description?: string } = {},
  ): Observable<Page> {
    return this.http.post<Page>(
      `${runtimeConfig.apiUrl}/pages/from-template/${templateId}`,
      details,
    );
  }

  createLayoutFrom(
    templateId: string,
    details: { name?: string; siteName?: string; description?: string } = {},
  ): Observable<Layout> {
    return this.http.post<Layout>(
      `${runtimeConfig.apiUrl}/layouts/from-template/${templateId}`,
      details,
    );
  }

  /** Append (default) or replace the page's snippets with the template's. */
  applyToPage(
    pageId: string,
    templateId: string,
    mode: 'append' | 'replace' = 'append',
  ): Observable<Page> {
    return this.http.post<Page>(
      `${runtimeConfig.apiUrl}/pages/${pageId}/apply-template/${templateId}`,
      { mode },
    );
  }

  applyToLayout(
    layoutId: string,
    templateId: string,
    options: { mode?: 'append' | 'replace'; subPageIndex?: number } = {},
  ): Observable<Layout> {
    return this.http.post<Layout>(
      `${runtimeConfig.apiUrl}/layouts/${layoutId}/apply-template/${templateId}`,
      { mode: options.mode ?? 'append', subPageIndex: options.subPageIndex },
    );
  }
}
