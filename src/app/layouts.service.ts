import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class LayoutsService {
  private http = inject(HttpClient);

  getAllLayouts(): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/layouts`);
  }

  getLayoutById(id: string): Observable<any> {
    console.log('in get layout by id', `${environment.apiUrl}/layouts/${id}`);
    return this.http.get<any>(`${environment.apiUrl}/layouts/${id}`);
  }

  createLayout(layoutData: { name: string; projectId?: string; snippets?: any[] }): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/layouts`, layoutData);
  }

  updateLayoutSnippets(
    layoutId: string,
    snippets: { id: string; cssOverride: string; htmlOverride: string; jsOverride: string }[]
  ): Observable<any> {
    return this.http.put<any>(`${environment.apiUrl}/layouts/${layoutId}`, { snippets });
  }
}

