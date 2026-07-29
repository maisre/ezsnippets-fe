import { Component, HostListener, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
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
  private authService = inject(AuthService);
  private orgsService = inject(OrgsService);
  private paymentsService = inject(PaymentsService);

  org: Org | null = null;
  openingPortal = false;
  portalError = '';

  private planNames: Record<string, string> = {
    pri_01kr05y9cq25yt75ey1ddkpger: 'Basic Monthly',
    pri_01kr07scygf6jf4a2xbvra76y6: 'Basic Yearly',
    pri_01kr07vbve5a770reznmza9hdq: 'Pro Monthly',
    pri_01kr07vyv692rrj6gn8m57e683: 'Pro Yearly',
    pri_01kr07xbjrdw0jztyfta1xfqre: 'Enterprise Monthly',
    pri_01kr07xy7sty2xhwcqjgzny8x4: 'Enterprise Yearly',
  };

  ngOnInit() {
    this.orgsService.getMyOrgs().subscribe((orgs) => {
      this.org = orgs.find((o) => o.personal) || orgs[0] || null;
    });
  }

  getPlanName(): string {
    if (!this.org?.plan) return 'None';
    return this.planNames[this.org.plan] || this.org.plan;
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
