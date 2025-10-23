import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SnippetsService {
  private http = inject(HttpClient);

  getAllSnippets(): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/snippets`);
  }

  getSnippetsByPageId(pageId: string): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/snippets?pageId=${pageId}`);
  }
}
