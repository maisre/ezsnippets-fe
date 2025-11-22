import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';
import { Page, CreatePageDto, SnippetOverride } from './models';

@Injectable({
  providedIn: 'root',
})
export class PagesService {
  private http = inject(HttpClient);

  getAllPages(): Observable<Page[]> {
    return this.http.get<Page[]>(`${environment.apiUrl}/pages`);
  }

  getPageById(id: string): Observable<Page> {
    console.log('in get page by id', `${environment.apiUrl}/pages/${id}`);
    return this.http.get<Page>(`${environment.apiUrl}/pages/${id}`);
  }

  createPage(pageData: CreatePageDto): Observable<Page> {
    return this.http.post<Page>(`${environment.apiUrl}/pages`, pageData);
  }

  updatePageSnippets(pageId: string, snippets: SnippetOverride[]): Observable<Page> {
    return this.http.put<Page>(`${environment.apiUrl}/pages/${pageId}`, { snippets });
  }
}
