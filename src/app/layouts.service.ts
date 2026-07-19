import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { runtimeConfig } from './runtime-config';
import { Layout, CreateLayoutDto, SnippetOverride } from './models';

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
    details: { name: string; siteName: string; description: string },
  ): Observable<Layout> {
    return this.http.put<Layout>(`${runtimeConfig.apiUrl}/layouts/${layoutId}`, details);
  }

  customizeLayout(layoutId: string): Observable<Layout> {
    return this.http.post<Layout>(`${runtimeConfig.apiUrl}/layouts/${layoutId}/customize`, {});
  }

  /**
   * Fill the layout's image slots with AI-chosen stock photos. Separate from
   * customizeLayout so re-running text never re-runs images.
   */
  customizeLayoutImages(
    layoutId: string,
    options: { direction?: string; replaceExisting?: boolean } = {},
  ): Observable<Layout> {
    return this.http.post<Layout>(
      `${runtimeConfig.apiUrl}/layouts/${layoutId}/customize-images`,
      options,
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
