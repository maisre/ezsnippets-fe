import { inject, Injectable } from '@angular/core';
import { runtimeConfig } from './runtime-config';
import { HttpClient } from '@angular/common/http';
import { Org } from './models';

@Injectable({
  providedIn: 'root',
})
export class OrgsService {
  private http = inject(HttpClient);

  getMyOrgs() {
    return this.http.get<Org[]>(`${runtimeConfig.apiUrl}/orgs`);
  }
}
