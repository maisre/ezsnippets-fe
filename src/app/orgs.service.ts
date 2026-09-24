import { inject, Injectable } from '@angular/core';
import { runtimeConfig } from './runtime-config';
import { HttpClient } from '@angular/common/http';
import { FavoriteSnippet, Org } from './models';

@Injectable({
  providedIn: 'root',
})
export class OrgsService {
  private http = inject(HttpClient);

  getMyOrgs() {
    return this.http.get<Org[]>(`${runtimeConfig.apiUrl}/orgs`);
  }

  // --- Favorites -----------------------------------------------------------
  //
  // Org-scoped, not per-user: in a shared Agency workspace the shortlist one
  // designer builds is meant to be the one their teammate opens. Every call
  // returns the whole resulting list, so the caller can just replace its copy
  // instead of reasoning about what changed.

  listFavorites() {
    return this.http.get<{ favorites: FavoriteSnippet[] }>(
      `${runtimeConfig.apiUrl}/orgs/favorites`,
    );
  }

  /** Idempotent — starring something already starred is a successful no-op. */
  addFavorite(snippetId: string) {
    return this.http.post<{ favorites: FavoriteSnippet[] }>(
      `${runtimeConfig.apiUrl}/orgs/favorites`,
      { snippetId },
    );
  }

  /** Idempotent — unstarring something not starred is a successful no-op. */
  removeFavorite(snippetId: string) {
    return this.http.delete<{ favorites: FavoriteSnippet[] }>(
      `${runtimeConfig.apiUrl}/orgs/favorites/${snippetId}`,
    );
  }
}
