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
  ImageFillMode,
  ImageFillSummary,
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
    details: {
      name?: string;
      siteName?: string;
      description?: string;
      slug?: string | null;
    },
  ): Observable<Page> {
    return this.http.put<Page>(`${runtimeConfig.apiUrl}/pages/${pageId}`, details);
  }

  /**
   * Set the page's theme palette. The list replaces the stored colours, so
   * send every variable of the palette. The server validates names and hex
   * values and returns the updated page.
   */
  setPageColors(pageId: string, colors: Record<string, string>): Observable<Page> {
    return this.http.put<Page>(`${runtimeConfig.apiUrl}/pages/${pageId}/colors`, {
      colorVariables: Object.entries(colors).map(([variable, value]) => ({
        variable,
        value,
      })),
    });
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
      mode?: ImageFillMode;
      keywords?: string;
      direction?: string;
      replaceExisting?: boolean;
      onlyMissing?: boolean;
    } = {},
  ): Observable<Page & { imageFill?: ImageFillSummary }> {
    return this.http.post<Page & { imageFill?: ImageFillSummary }>(
      `${runtimeConfig.apiUrl}/pages/${pageId}/customize-images`,
      options,
    );
  }

  /** AI-suggested keyword sets for image Quick fill (one small AI call). */
  suggestImageKeywords(pageId: string): Observable<{ keywords: string[] }> {
    return this.http.post<{ keywords: string[] }>(
      `${runtimeConfig.apiUrl}/pages/${pageId}/image-keywords`,
      {},
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

  // --- Scratch pad ---------------------------------------------------------
  //
  // Every call sends indexes, never snippet bodies, and the server returns the
  // whole updated page. That is deliberate: this component holds snippet
  // membership and order but not the page-scoped customizations (text and
  // image overrides, shutterstockId), so posting snippets back would strip
  // them. Take the server's page as the new truth rather than patching the
  // local arrays.

  /** Pull a snippet off the page and onto the scratch pad. */
  parkSnippet(pageId: string, index: number): Observable<Page> {
    return this.http.post<Page>(
      `${runtimeConfig.apiUrl}/pages/${pageId}/scratch-pad/park`,
      { index },
    );
  }

  /** Put a parked snippet back on the page. Omit toIndex to append. */
  restoreSnippet(
    pageId: string,
    scratchIndex: number,
    toIndex?: number,
  ): Observable<Page> {
    return this.http.post<Page>(
      `${runtimeConfig.apiUrl}/pages/${pageId}/scratch-pad/restore`,
      { scratchIndex, toIndex },
    );
  }

  reorderScratchPad(pageId: string, from: number, to: number): Observable<Page> {
    return this.http.post<Page>(
      `${runtimeConfig.apiUrl}/pages/${pageId}/scratch-pad/reorder`,
      { from, to },
    );
  }

  /** Destructive: the parked snippet's customizations go with it. */
  discardScratchSnippet(pageId: string, scratchIndex: number): Observable<Page> {
    return this.http.delete<Page>(
      `${runtimeConfig.apiUrl}/pages/${pageId}/scratch-pad/${scratchIndex}`,
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
