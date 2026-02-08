import { inject, Injectable } from '@angular/core';
import { environment } from './../environments/environment';
import { HttpClient } from '@angular/common/http';
import { Org } from './models';

@Injectable({
  providedIn: 'root',
})
export class OrgsService {
  private http = inject(HttpClient);

  getMyOrgs() {
    return this.http.get<Org[]>(`${environment.apiUrl}/orgs`);
  }
}
