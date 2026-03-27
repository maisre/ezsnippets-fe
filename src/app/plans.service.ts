import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

export interface PlanUsage {
  hasPlan: boolean;
  plan: string | null;
  limits: { maxPages: number; maxLayouts: number; maxSnippets: number } | null;
  usage: { pages: number; layouts: number } | null;
}

@Injectable({
  providedIn: 'root',
})
export class PlansService {
  private http = inject(HttpClient);

  getUsage(): Observable<PlanUsage> {
    return this.http.get<PlanUsage>(`${environment.apiUrl}/plans/usage`);
  }
}
