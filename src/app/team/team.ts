import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { OrgsService } from '../orgs.service';
import { TeamInvite, TeamView } from '../models';

type Member = TeamView['members'][number];

/**
 * Members and invites for the active team workspace.
 *
 * Every button here is display-only gating — the API enforces the same rules
 * (owner: everything; admin: manage members but not other admins; member:
 * read-only here), so a hidden button is a courtesy, not a control.
 */
@Component({
  selector: 'app-team',
  imports: [FormsModule, RouterLink],
  templateUrl: './team.html',
  styleUrl: './team.css',
})
export class Team implements OnInit {
  private orgsService = inject(OrgsService);
  private authService = inject(AuthService);
  private router = inject(Router);

  team: TeamView | null = null;
  loading = true;
  /** Set when the active workspace is personal — there's no team to show. */
  personal = false;
  error = '';

  inviteEmail = '';
  inviteRole: 'admin' | 'member' = 'member';
  inviting = false;
  inviteNotice = '';

  editingName = false;
  nameDraft = '';

  busy: string | null = null;

  readonly myId = this.authService.getUserId();

  ngOnInit() {
    this.orgsService.getMyOrgs().subscribe({
      next: (orgs) => {
        const active = orgs.find((o) => o.active);
        if (!active || active.personal) {
          this.personal = true;
          this.loading = false;
          return;
        }
        this.load(active.id);
      },
      error: () => {
        this.error = 'Could not load your workspace.';
        this.loading = false;
      },
    });
  }

  private load(orgId: string) {
    this.orgsService.getTeam(orgId).subscribe({
      next: (team) => {
        this.team = team;
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.message ?? 'Could not load the team.';
        this.loading = false;
      },
    });
  }

  private reload() {
    if (this.team) this.load(this.team.org.id);
  }

  get canManage(): boolean {
    return this.team?.myRole === 'owner' || this.team?.myRole === 'admin';
  }

  get isOwner(): boolean {
    return this.team?.myRole === 'owner';
  }

  get seatsFull(): boolean {
    const seats = this.team?.seats;
    if (!seats || seats.limit === null) return true;
    return seats.limit !== -1 && seats.used >= seats.limit;
  }

  canRemove(member: Member): boolean {
    if (member.userId === this.myId || member.role === 'owner') return false;
    if (this.isOwner) return true;
    return this.team?.myRole === 'admin' && member.role === 'member';
  }

  roleLabel(role: string): string {
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  expiresLabel(invite: TeamInvite): string {
    return new Date(invite.expiresAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  sendInvite(email = this.inviteEmail, role = this.inviteRole) {
    if (!this.team || !email.trim() || this.inviting) return;
    this.inviting = true;
    this.error = '';
    this.inviteNotice = '';
    this.orgsService.invite(this.team.org.id, email.trim(), role).subscribe({
      next: (invite) => {
        this.inviting = false;
        this.inviteEmail = '';
        this.inviteNotice = `Invite sent to ${invite.email}.`;
        this.reload();
      },
      error: (err) => {
        this.inviting = false;
        this.error = err?.error?.message ?? 'Could not send that invite.';
      },
    });
  }

  resend(invite: TeamInvite) {
    this.sendInvite(invite.email, invite.role);
  }

  revoke(invite: TeamInvite) {
    if (!this.team) return;
    this.busy = invite.id;
    this.orgsService.revokeInvite(this.team.org.id, invite.id).subscribe({
      next: () => {
        this.busy = null;
        this.reload();
      },
      error: (err) => this.fail(err, 'Could not revoke that invite.'),
    });
  }

  changeRole(member: Member, role: 'admin' | 'member') {
    if (!this.team || member.role === role) return;
    this.busy = member.userId;
    this.orgsService.setRole(this.team.org.id, member.userId, role).subscribe({
      next: () => {
        this.busy = null;
        this.reload();
      },
      error: (err) => this.fail(err, 'Could not change that role.'),
    });
  }

  remove(member: Member) {
    if (!this.team) return;
    this.busy = member.userId;
    this.orgsService.removeMember(this.team.org.id, member.userId).subscribe({
      next: () => {
        this.busy = null;
        this.reload();
      },
      error: (err) => this.fail(err, 'Could not remove that member.'),
    });
  }

  leave() {
    if (!this.team) return;
    this.busy = 'leave';
    this.orgsService.leave(this.team.org.id).subscribe({
      next: (res) => this.authService.enterWorkspace(res.access_token),
      error: (err) => this.fail(err, 'Could not leave this workspace.'),
    });
  }

  startRename() {
    this.nameDraft = this.team?.org.name ?? '';
    this.editingName = true;
  }

  saveName() {
    if (!this.team || !this.nameDraft.trim()) return;
    this.busy = 'rename';
    this.orgsService.rename(this.team.org.id, this.nameDraft.trim()).subscribe({
      next: (res) => {
        this.busy = null;
        this.editingName = false;
        if (this.team) this.team.org.name = res.name;
      },
      error: (err) => this.fail(err, 'Could not rename the workspace.'),
    });
  }

  private fail(err: any, fallback: string) {
    this.busy = null;
    this.error = err?.error?.message ?? fallback;
  }

  goToPricing() {
    this.router.navigate(['/pricing']);
  }
}
