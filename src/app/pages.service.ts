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

  createPage(pageData: { name: string; projectId?: string; snippets?: any[] }): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/pages`, pageData);
  }
}
