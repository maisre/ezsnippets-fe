import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';
import { SnippetOverride, Snippet, SnippetFilters } from './models';

@Injectable({
  providedIn: 'root',
})
export class SnippetsService {
  private http = inject(HttpClient);

  getAllSnippetSummary(): Observable<SnippetOverride[]> {
    return this.http.get<SnippetOverride[]>(`${environment.apiUrl}/snippets/summary`);
  }

  getFilters(): Observable<SnippetFilters> {
    return this.http.get<SnippetFilters>(`${environment.apiUrl}/snippets/filters`);
  }

  getSnippetsByPageId(pageId: string): Observable<Snippet[]> {
    return this.http.get<Snippet[]>(`${environment.apiUrl}/snippets?pageId=${pageId}`);
  }
}
