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

  customizePage(pageId: string): Observable<Page> {
    return this.http.post<Page>(`${runtimeConfig.apiUrl}/pages/${pageId}/customize`, {});
  }
}
