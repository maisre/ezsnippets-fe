import { inject, Injectable, signal } from '@angular/core';
import { of, switchMap } from 'rxjs';
import { AuthService } from './auth.service';
import { OrgsService } from './orgs.service';

/**
 * Turns a page/layout `createdBy` user id into something to show on it:
 * "you", a teammate's email, or "a former member". Only team workspaces get
 * labels — in a personal workspace everything is yours, so labelFor returns
 * null there and the templates show nothing.
 */
@Injectable({ providedIn: 'root' })
export class CreatorLabelsService {
  private orgsService = inject(OrgsService);
  private authService = inject(AuthService);

  /** userId → label for the active team workspace; null when there's nothing to show. */
  private labels = signal<Map<string, string> | null>(null);

  load(): void {
    this.orgsService
      .getMyOrgs()
      .pipe(
        switchMap((orgs) => {
          const active = orgs.find((o) => o.active);
          return active && !active.personal ? this.orgsService.getTeam(active.id) : of(null);
        }),
      )
      .subscribe({
        next: (team) => {
          if (!team) {
            this.labels.set(null);
            return;
          }
          const me = this.authService.getUserId();
          this.labels.set(
            new Map(
              team.members.map((m) => [
                m.userId,
                m.userId === me ? 'you' : (m.email ?? 'a teammate'),
              ]),
            ),
          );
        },
        // Purely informational — a failure just means no labels.
        error: () => this.labels.set(null),
      });
  }

  labelFor(userId: string | undefined): string | null {
    const labels = this.labels();
    if (!labels || !userId) return null;
    // Removed members' work stays with the team.
    return labels.get(userId) ?? 'a former member';
  }
}
