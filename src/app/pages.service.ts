import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { runtimeConfig } from './runtime-config';
import { Page, CreatePageDto, SnippetOverride } from './models';

@Injectable({
  providedIn: 'root',
})
export class PagesService {
  private http = inject(HttpClient);

  getAllPages(): Observable<Page[]> {
    return this.http.get<Page[]>(`${runtimeConfig.apiUrl}/pages`);
  }

  getPageById(id: string): Observable<Page> {
    return this.http.get<Page>(`${runtimeConfig.apiUrl}/pages/${id}`);
  }

  createPage(pageData: CreatePageDto): Observable<Page> {
    return this.http.post<Page>(`${runtimeConfig.apiUrl}/pages`, pageData);
  }

  updatePageSnippets(pageId: string, snippets: SnippetOverride[]): Observable<Page> {
    return this.http.put<Page>(`${runtimeConfig.apiUrl}/pages/${pageId}`, { snippets });
  }

  /**
   * Updates only the page's metadata. The server applies just the fields it
   * receives, so snippets and textVariant are left untouched; sending an empty
   * string for siteName/description clears that field.
   */
  updatePageDetails(
    pageId: string,
    details: { name: string; siteName: string; description: string },
  ): Observable<Page> {
    return this.http.put<Page>(`${runtimeConfig.apiUrl}/pages/${pageId}`, details);
  }

  customizePage(pageId: string): Observable<Page> {
    return this.http.post<Page>(`${runtimeConfig.apiUrl}/pages/${pageId}/customize`, {});
  }

  /**
   * Fill the page's image slots with AI-chosen stock photos. Separate from
   * customizePage so re-running text never re-runs images.
   */
  customizePageImages(
    pageId: string,
    options: { direction?: string; replaceExisting?: boolean } = {},
  ): Observable<Page> {
    return this.http.post<Page>(
      `${runtimeConfig.apiUrl}/pages/${pageId}/customize-images`,
      options,
    );
  }

  duplicatePage(pageId: string): Observable<Page> {
    return this.http.post<Page>(`${runtimeConfig.apiUrl}/pages/${pageId}/duplicate`, {});
  }

  archivePage(pageId: string): Observable<Page> {
    return this.http.patch<Page>(`${runtimeConfig.apiUrl}/pages/${pageId}/archive`, {});
  }

  /** Fails with 403 if restoring would push the org over its plan limit. */
  restorePage(pageId: string): Observable<Page> {
    return this.http.patch<Page>(`${runtimeConfig.apiUrl}/pages/${pageId}/restore`, {});
  }

  deletePage(pageId: string): Observable<void> {
    return this.http.delete<void>(`${runtimeConfig.apiUrl}/pages/${pageId}`);
  }
}
