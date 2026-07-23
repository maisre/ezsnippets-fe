import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { runtimeConfig } from './runtime-config';
import {
  Page,
  CreatePageDto,
  SnippetOverride,
  LicensingResponse,
  GenerateCollectionResponse,
} from './models';

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

  /**
   * Run AI text customization. Pass onlyMissing to customize just the snippets
   * that were never customized (e.g. ones added after an earlier run), leaving
   * the rest untouched; omit it to re-customize the whole page.
   */
  customizePage(pageId: string, onlyMissing = false): Observable<Page> {
    return this.http.post<Page>(
      `${runtimeConfig.apiUrl}/pages/${pageId}/customize`,
      { onlyMissing },
    );
  }

  /**
   * Fill the page's image slots with AI-chosen stock photos. Separate from
   * customizePage so re-running text never re-runs images. Pass onlyMissing to
   * populate just the not-yet-populated snippets; replaceExisting to redo every
   * slot on the targeted snippets.
   */
  customizePageImages(
    pageId: string,
    options: {
      direction?: string;
      replaceExisting?: boolean;
      onlyMissing?: boolean;
    } = {},
  ): Observable<Page> {
    return this.http.post<Page>(
      `${runtimeConfig.apiUrl}/pages/${pageId}/customize-images`,
      options,
    );
  }

  /** Download the page as a self-contained static-site zip. */
  downloadPage(pageId: string): Observable<Blob> {
    return this.http.get(`${runtimeConfig.apiUrl}/pages/${pageId}/download`, {
      responseType: 'blob',
    });
  }

  /** The Shutterstock images on the page that need licensing before publishing. */
  getLicensing(pageId: string): Observable<LicensingResponse> {
    return this.http.get<LicensingResponse>(
      `${runtimeConfig.apiUrl}/pages/${pageId}/licensing`,
    );
  }

  /** Build a one-click "license all images" Shutterstock Collection link. */
  generateCollection(pageId: string): Observable<GenerateCollectionResponse> {
    return this.http.post<GenerateCollectionResponse>(
      `${runtimeConfig.apiUrl}/pages/${pageId}/collection`,
      {},
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
