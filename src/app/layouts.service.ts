import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { runtimeConfig } from './runtime-config';
import {
  Layout,
  CreateLayoutDto,
  SnippetOverride,
  LicensingResponse,
  GenerateCollectionResponse,
} from './models';

@Injectable({
  providedIn: 'root',
})
export class LayoutsService {
  private http = inject(HttpClient);

  getAllLayouts(): Observable<Layout[]> {
    return this.http.get<Layout[]>(`${runtimeConfig.apiUrl}/layouts`);
  }

  getLayoutById(id: string): Observable<Layout> {
    return this.http.get<Layout>(`${runtimeConfig.apiUrl}/layouts/${id}`);
  }

  createLayout(layoutData: CreateLayoutDto): Observable<Layout> {
    return this.http.post<Layout>(`${runtimeConfig.apiUrl}/layouts`, layoutData);
  }

  updateLayoutSnippets(layoutId: string, snippets: SnippetOverride[]): Observable<Layout> {
    return this.http.put<Layout>(`${runtimeConfig.apiUrl}/layouts/${layoutId}`, { snippets });
  }

  updateLayout(layoutId: string, layoutData: Partial<Layout>): Observable<Layout> {
    return this.http.put<Layout>(`${runtimeConfig.apiUrl}/layouts/${layoutId}`, layoutData);
  }

  /**
   * Updates only the layout's metadata. The server applies just the fields it
   * receives, so nav/footer/subPages are left untouched; sending an empty
   * string for siteName/description clears that field.
   */
  updateLayoutDetails(
    layoutId: string,
    details: {
      name: string;
      siteName: string;
      description: string;
      slug?: string | null;
    },
  ): Observable<Layout> {
    return this.http.put<Layout>(`${runtimeConfig.apiUrl}/layouts/${layoutId}`, details);
  }

  /**
   * Run AI text customization. Pass onlyMissing to customize just the snippets
   * that were never customized (e.g. ones added after an earlier run), leaving
   * the rest untouched; omit it to re-customize the whole layout.
   */
  customizeLayout(layoutId: string, onlyMissing = false): Observable<Layout> {
    return this.http.post<Layout>(
      `${runtimeConfig.apiUrl}/layouts/${layoutId}/customize`,
      { onlyMissing },
    );
  }

  /**
   * Fill the layout's image slots with AI-chosen stock photos. Separate from
   * customizeLayout so re-running text never re-runs images. Pass onlyMissing to
   * populate just the not-yet-populated snippets; replaceExisting to redo every
   * slot on the targeted snippets.
   */
  customizeLayoutImages(
    layoutId: string,
    options: {
      direction?: string;
      replaceExisting?: boolean;
      onlyMissing?: boolean;
    } = {},
  ): Observable<Layout> {
    return this.http.post<Layout>(
      `${runtimeConfig.apiUrl}/layouts/${layoutId}/customize-images`,
      options,
    );
  }

  /** Download the layout as a self-contained static-site zip. */
  downloadLayout(layoutId: string): Observable<Blob> {
    return this.http.get(`${runtimeConfig.apiUrl}/layouts/${layoutId}/download`, {
      responseType: 'blob',
    });
  }

  /** The Shutterstock images on the layout that need licensing before publishing. */
  getLicensing(layoutId: string): Observable<LicensingResponse> {
    return this.http.get<LicensingResponse>(
      `${runtimeConfig.apiUrl}/layouts/${layoutId}/licensing`,
    );
  }

  /** Build a one-click "license all images" Shutterstock Collection link. */
  generateCollection(layoutId: string): Observable<GenerateCollectionResponse> {
    return this.http.post<GenerateCollectionResponse>(
      `${runtimeConfig.apiUrl}/layouts/${layoutId}/collection`,
      {},
    );
  }

  // --- Scratch pad ---------------------------------------------------------
  //
  // Layout-wide, so park/restore name the subpage. Only indexes cross the
  // wire; the server moves its own stored snippet so customizations survive.
  // The response is the whole updated layout — treat it as the new truth
  // rather than patching local arrays.

  /** Pull a snippet off a subpage and onto the scratch pad. */
  parkSnippet(
    layoutId: string,
    subPageIndex: number,
    index: number,
  ): Observable<Layout> {
    return this.http.post<Layout>(
      `${runtimeConfig.apiUrl}/layouts/${layoutId}/scratch-pad/park`,
      { subPageIndex, index },
    );
  }

  /** Put a parked snippet onto a subpage. Omit toIndex to append. */
  restoreSnippet(
    layoutId: string,
    scratchIndex: number,
    subPageIndex: number,
    toIndex?: number,
  ): Observable<Layout> {
    return this.http.post<Layout>(
      `${runtimeConfig.apiUrl}/layouts/${layoutId}/scratch-pad/restore`,
      { scratchIndex, subPageIndex, toIndex },
    );
  }

  reorderScratchPad(
    layoutId: string,
    from: number,
    to: number,
  ): Observable<Layout> {
    return this.http.post<Layout>(
      `${runtimeConfig.apiUrl}/layouts/${layoutId}/scratch-pad/reorder`,
      { from, to },
    );
  }

  /** Destructive: the parked snippet's customizations go with it. */
  discardScratchSnippet(
    layoutId: string,
    scratchIndex: number,
  ): Observable<Layout> {
    return this.http.delete<Layout>(
      `${runtimeConfig.apiUrl}/layouts/${layoutId}/scratch-pad/${scratchIndex}`,
    );
  }

  duplicateLayout(layoutId: string): Observable<Layout> {
    return this.http.post<Layout>(`${runtimeConfig.apiUrl}/layouts/${layoutId}/duplicate`, {});
  }

  archiveLayout(layoutId: string): Observable<Layout> {
    return this.http.patch<Layout>(`${runtimeConfig.apiUrl}/layouts/${layoutId}/archive`, {});
  }

  /** Fails with 403 if restoring would push the org over its plan limit. */
  restoreLayout(layoutId: string): Observable<Layout> {
    return this.http.patch<Layout>(`${runtimeConfig.apiUrl}/layouts/${layoutId}/restore`, {});
  }

  deleteLayout(layoutId: string): Observable<void> {
    return this.http.delete<void>(`${runtimeConfig.apiUrl}/layouts/${layoutId}`);
  }
}
