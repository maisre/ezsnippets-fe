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

  customizeLayout(layoutId: string): Observable<Layout> {
    return this.http.post<Layout>(`${runtimeConfig.apiUrl}/layouts/${layoutId}/customize`, {});
  }
}
