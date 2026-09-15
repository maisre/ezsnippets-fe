import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { runtimeConfig } from './runtime-config';

export type CustomDomainStatus = 'pending' | 'active' | 'failed';

export interface CustomDomain {
  id: string;
  hostname: string;
  status: CustomDomainStatus;
  lastError: string | null;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class DomainsService {
  private http = inject(HttpClient);

  getDomains(): Observable<CustomDomain[]> {
    return this.http.get<CustomDomain[]>(`${runtimeConfig.apiUrl}/domains`);
  }

  /**
   * The hostname customers point their CNAME at. Served by the API rather than
   * baked into the bundle so the setup instructions stay right if the edge
   * ever moves.
   */
  getTarget(): Observable<{ target: string }> {
    return this.http.get<{ target: string }>(
      `${runtimeConfig.apiUrl}/domains/target`,
    );
  }

  addDomain(hostname: string): Observable<CustomDomain> {
    return this.http.post<CustomDomain>(`${runtimeConfig.apiUrl}/domains`, {
      hostname,
    });
  }

  /** Re-run the DNS check now instead of waiting for the hourly sweep. */
  verifyDomain(id: string): Observable<CustomDomain> {
    return this.http.post<CustomDomain>(
      `${runtimeConfig.apiUrl}/domains/${id}/verify`,
      {},
    );
  }

  removeDomain(id: string): Observable<void> {
    return this.http.delete<void>(`${runtimeConfig.apiUrl}/domains/${id}`);
  }
}
