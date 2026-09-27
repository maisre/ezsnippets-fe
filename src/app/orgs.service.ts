import { inject, Injectable } from '@angular/core';
import { runtimeConfig } from './runtime-config';
import { HttpClient } from '@angular/common/http';
import { FavoriteSnippet, InvitePreview, Org, TeamInvite, TeamView } from './models';

@Injectable({
  providedIn: 'root',
})
export class OrgsService {
  private http = inject(HttpClient);

  getMyOrgs() {
    return this.http.get<Org[]>(`${runtimeConfig.apiUrl}/orgs`);
  }

  // --- Team -----------------------------------------------------------------

  getTeam(orgId: string) {
    return this.http.get<TeamView>(`${runtimeConfig.apiUrl}/orgs/${orgId}/members`);
  }

  rename(orgId: string, name: string) {
    return this.http.patch<{ name: string }>(
      `${runtimeConfig.apiUrl}/orgs/${orgId}/name`,
      { name },
    );
  }

  /** Re-inviting a pending address re-sends it with a fresh link. */
  invite(orgId: string, email: string, role: 'admin' | 'member') {
    return this.http.post<TeamInvite>(
      `${runtimeConfig.apiUrl}/orgs/${orgId}/invites`,
      { email, role },
    );
  }

  revokeInvite(orgId: string, inviteId: string) {
    return this.http.delete(`${runtimeConfig.apiUrl}/orgs/${orgId}/invites/${inviteId}`);
  }

  setRole(orgId: string, userId: string, role: 'admin' | 'member') {
    return this.http.patch(`${runtimeConfig.apiUrl}/orgs/${orgId}/members/${userId}`, {
      role,
    });
  }

  removeMember(orgId: string, userId: string) {
    return this.http.delete(`${runtimeConfig.apiUrl}/orgs/${orgId}/members/${userId}`);
  }

  /** Returns a token for the caller's personal workspace. */
  leave(orgId: string) {
    return this.http.post<{ access_token: string }>(
      `${runtimeConfig.apiUrl}/orgs/${orgId}/leave`,
      {},
      { withCredentials: true },
    );
  }

  previewInvite(token: string) {
    return this.http.get<InvitePreview>(
      `${runtimeConfig.apiUrl}/invites/${encodeURIComponent(token)}`,
    );
  }

  acceptInvite(token: string) {
    return this.http.post<{ orgId: string; access_token: string }>(
      `${runtimeConfig.apiUrl}/invites/${encodeURIComponent(token)}/accept`,
      {},
      { withCredentials: true },
    );
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
