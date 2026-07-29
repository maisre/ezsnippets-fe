import { Component, HostListener, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { runtimeConfig } from '../runtime-config';
import { AuthService } from '../auth.service';
import { OrgsService } from '../orgs.service';
import { PaymentsService } from '../payments.service';
import { Org } from '../models';

@Component({
  selector: 'app-account',
  imports: [RouterLink],
  templateUrl: './account.html',
  styleUrl: './account.css',
})
export class Account implements OnInit {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private orgsService = inject(OrgsService);
  private paymentsService = inject(PaymentsService);

  org: Org | null = null;
  openingPortal = false;
  portalError = '';

  // The plan's name comes from the API rather than a local price-id map, so a
  // new price under an existing plan doesn't show up here as a raw id.
  planName = 'None';

  ngOnInit() {
    this.orgsService.getMyOrgs().subscribe((orgs) => {
      this.org = orgs.find((o) => o.personal) || orgs[0] || null;
    });
    this.loadUsage();
  }

  private loadUsage() {
    this.http
      .get<{ hasPlan: boolean; plan: string | null }>(
        `${runtimeConfig.apiUrl}/plans/usage`,
      )
      .subscribe({
        next: (usage) => {
          this.planName = usage.hasPlan && usage.plan ? usage.plan : 'None';
        },
        error: () => {
          this.planName = 'None';
        },
      });
  }

  getStatusLabel(): string {
    if (!this.org?.subscriptionStatus) return 'No subscription';
    const s = this.org.subscriptionStatus;
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
  }

  getStatusClass(): string {
    switch (this.org?.subscriptionStatus) {
      case 'active':
        return 'status-active';
      case 'canceled':
        return 'status-canceled';
      case 'past_due':
        return 'status-past-due';
      default:
        return 'status-none';
    }
  }

  getCardDisplay(): string {
    if (!this.org?.cardLast4) return '';
    const brand = (this.org.cardBrand || 'Card').replace(/^./, c => c.toUpperCase());
    return `${brand} ending in ${this.org.cardLast4} (${this.org.cardExpMonth}/${this.org.cardExpYear})`;
  }

  getNextChargeDate(): string {
    if (!this.org?.currentPeriodEnd) return '';
    const date = new Date(this.org.currentPeriodEnd * 1000);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  // Display only — the API enforces owner-only on the portal session itself.
  canManageBilling(): boolean {
    const userId = this.authService.getUserId();
    if (!userId || !this.org?.paddleCustomerId) return false;
    return this.org.members.some(
      (m) => m.user === userId && m.role === 'owner',
    );
  }

  // Cancelling goes through the portal too, so Paddle's retention flow gets a
  // chance to make the customer an offer before it's confirmed.
  openBilling(target: 'overview' | 'cancel' = 'overview') {
    // The tab has to be opened on the click itself; opening it once the
    // request comes back reads as a popup and gets blocked.
    const tab = window.open('', '_blank');
    this.openingPortal = true;
    this.portalError = '';

    this.paymentsService.createPortalSession().subscribe({
      next: (session) => {
        this.openingPortal = false;
        const url =
          target === 'cancel'
            ? session.cancelUrl || session.overviewUrl
            : session.overviewUrl;
        if (tab) {
          tab.location.href = url;
        } else {
          window.location.href = url;
        }
      },
      error: (err) => {
        this.openingPortal = false;
        tab?.close();
        this.portalError = 'Could not open billing. Please try again.';
        console.error('Portal error:', err);
      },
    });
  }

  // The cancellation itself happens in the Paddle portal, so the result
  // arrives here by webhook rather than by response. Re-read the org when the
  // tab regains focus so the status reflects it without a manual refresh.
  @HostListener('window:focus')
  refreshOrg() {
    if (!this.org) return;
    this.orgsService.getMyOrgs().subscribe((orgs) => {
      this.org = orgs.find((o) => o.personal) || orgs[0] || null;
    });
  }
}
