import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class PagesService {
  private http = inject(HttpClient);

  getAllPages(): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/pages`);
  }

  getPageById(id: string): Observable<any> {
    console.log('in get page by id', `${environment.apiUrl}/pages/${id}`);
    return this.http.get<any>(`${environment.apiUrl}/pages/${id}`);
  }

  createPage(pageData: { name: string; projectId?: string; snippets?: any[] }): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/pages`, pageData);
  }

  updatePageSnippets(
    pageId: string,
    snippets: { id: string; cssOverride: string; htmlOverride: string; jsOverride: string }[]
  ): Observable<any> {
    return this.http.put<any>(`${environment.apiUrl}/pages/${pageId}`, { snippets });
  }
}
