import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { OrgsService } from '../orgs.service';
import { trackPurchaseOnce } from '../analytics';

// Mirrors ez-api's subscription-status.ts.
const ENTITLED = new Set(['active', 'trialing', 'past_due']);

@Component({
  selector: 'app-checkout-success',
  imports: [RouterLink],
  template: `
    <div class="success-page">
      <div class="success-card">
        <div class="success-icon">&#10003;</div>
        @if (teamState === 'waiting') {
          <h1>Setting up your team workspace</h1>
          <p>Your payment went through. This usually takes a few seconds.</p>
        } @else if (teamState === 'activating') {
          <h1>Activating your plan</h1>
          <p>Your payment went through. This usually takes a few seconds.</p>
        } @else if (teamState === 'slow') {
          <h1>Payment received</h1>
          <p>Your plan is still being activated. It should appear within a minute — refresh your dashboard if it hasn't. Please don't pay again.</p>
          <a routerLink="/pages" class="btn btn-primary">Go to Dashboard</a>
        } @else if (teamState === 'ready') {
          <h1>Your team workspace is ready</h1>
          <p>Invite your teammates to start working together.</p>
          <button class="btn btn-primary" (click)="enterTeam()">Invite your team</button>
        } @else {
          <h1>You're all set!</h1>
          <p>Your subscription is now active. Thanks for choosing EZ Snippet.</p>
          <a routerLink="/pages" class="btn btn-primary">Go to Dashboard</a>
        }
      </div>
    </div>
  `,
  styles: `
    .success-page {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 60vh;
      padding: 2rem;
    }
    .success-card {
      text-align: center;
      max-width: 480px;
      padding: 3rem 2rem;
      border: 1px solid #e0e0e0;
      border-radius: 12px;
      background: white;
    }
    .success-icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background-color: #27ae60;
      color: white;
      font-size: 2rem;
      line-height: 64px;
      margin: 0 auto 1.5rem;
    }
    h1 {
      font-size: 1.75rem;
      font-weight: 700;
      color: #2c3e50;
      margin: 0 0 0.75rem;
    }
    p {
      color: #666;
      margin: 0 0 2rem;
    }
    .btn {
      display: inline-block;
      padding: 0.8rem 2rem;
      border-radius: 6px;
      font-size: 1rem;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
    }
    .btn-primary {
      background-color: #3498db;
      color: white;
    }
    button.btn {
      border: none;
    }
    .btn-primary:hover {
      background-color: #2980b9;
    }
  `,
})
export class CheckoutSuccess implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private orgsService = inject(OrgsService);
  private authService = inject(AuthService);

  /**
   * A team plan bills a brand-new workspace (`?org=` from openCheckout). The
   * subscription reaches it by webhook, so wait for that before switching the
   * customer in — switching sooner lands them in a workspace with no plan.
   * A personal purchase waits the same way (`activating`), so "You're all
   * set" is never shown before the plan exists — otherwise the dashboard says
   * "no plan" right after paying, which invites a second purchase.
   * `slow` = we gave up waiting; `none` = done, or nothing to wait for.
   */
  teamState: 'none' | 'waiting' | 'activating' | 'slow' | 'ready' = 'none';
  private orgId = this.route.snapshot.queryParamMap.get('org');
  private timer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() {
    trackPurchaseOnce();
    if (this.orgId && this.authService.isAuthenticated()) {
      this.poll(0);
    }
  }

  ngOnDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  private poll(attempt: number) {
    this.orgsService.getMyOrgs().subscribe({
      next: (orgs) => {
        const org = orgs.find((o) => o.id === this.orgId);
        if (!org) {
          this.teamState = 'none';
        } else if (ENTITLED.has(org.subscriptionStatus ?? '')) {
          // A reused team org can carry a `canceled` status from an earlier
          // plan, so only a live status counts as landed.
          this.teamState = org.personal ? 'none' : 'ready';
        } else if (attempt < 20) {
          this.teamState = org.personal ? 'activating' : 'waiting';
          this.timer = setTimeout(() => this.poll(attempt + 1), 1500);
        } else {
          this.teamState = 'slow';
        }
      },
      error: () => (this.teamState = 'none'),
    });
  }

  enterTeam() {
    if (!this.orgId) return;
    this.authService.switchOrg(this.orgId).subscribe({
      next: (res) => this.authService.enterWorkspace(res.access_token, '/team'),
      // The workspace switcher reaches the team too; don't leave a dead button.
      error: () => (this.teamState = 'none'),
    });
  }
}
