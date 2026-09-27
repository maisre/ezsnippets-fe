import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { OrgsService } from '../orgs.service';
import { InvitePreview } from '../models';

/**
 * Landing page for an emailed team invite. Public: the invitee usually has no
 * account yet. Signing in or up comes back here via returnUrl, and accepting
 * drops them straight into the team workspace.
 */
@Component({
  selector: 'app-invite',
  imports: [RouterLink],
  templateUrl: './invite.html',
  styleUrl: './invite.css',
})
export class Invite implements OnInit {
  private route = inject(ActivatedRoute);
  private orgsService = inject(OrgsService);
  private authService = inject(AuthService);

  token = this.route.snapshot.paramMap.get('token') ?? '';
  preview: InvitePreview | null = null;
  loading = true;
  error = '';
  accepting = false;

  isSignedIn = this.authService.isAuthenticated();
  readonly returnUrl = `/invite/${this.token}`;

  ngOnInit() {
    this.orgsService.previewInvite(this.token).subscribe({
      next: (preview) => {
        this.preview = preview;
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.message ?? 'This invite is no longer valid.';
        this.loading = false;
      },
    });
  }

  accept() {
    this.accepting = true;
    this.error = '';
    this.orgsService.acceptInvite(this.token).subscribe({
      next: (res) => this.authService.enterWorkspace(res.access_token, '/team'),
      error: (err) => {
        this.accepting = false;
        this.error = err?.error?.message ?? 'Could not accept the invite.';
      },
    });
  }

  /** Signed in as the wrong account — sign out and stay on this page. */
  signOutAndSwitch() {
    this.authService.logout();
    this.isSignedIn = false;
  }
}
