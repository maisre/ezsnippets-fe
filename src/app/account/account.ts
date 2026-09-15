import { Component, HostListener, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { runtimeConfig } from '../runtime-config';
import { AuthService } from '../auth.service';
import { OrgsService } from '../orgs.service';
import { PaymentsService } from '../payments.service';
import { Org } from '../models';
import { CustomDomain, DomainsService } from '../domains.service';

@Component({
  selector: 'app-account',
  imports: [RouterLink, FormsModule],
  templateUrl: './account.html',
  styleUrl: './account.css',
})
export class Account implements OnInit {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private orgsService = inject(OrgsService);
  private paymentsService = inject(PaymentsService);
  private domainsService = inject(DomainsService);

  org: Org | null = null;
  openingPortal = false;
  portalError = '';

  // The plan's name comes from the API rather than a local price-id map, so a
  // new price under an existing plan doesn't show up here as a raw id.
  planName = 'None';

  // --- Custom domains (Pro / Agency) ---
  // maxCustomDomains drives the whole section: 0 hides it behind an upgrade
  // prompt, and the count gates the add form. It comes from /plans/usage so the
  // UI can never advertise an allowance the API would refuse.
  maxCustomDomains = 0;
  domains: CustomDomain[] = [];
  domainTarget = 'view.ez-snippets.com';
  newDomain = '';
  addingDomain = false;
  domainError = '';
  verifyingId: string | null = null;

  get canAddDomain(): boolean {
    return (
      this.maxCustomDomains === -1 ||
      this.domains.length < this.maxCustomDomains
    );
  }

  ngOnInit() {
    this.orgsService.getMyOrgs().subscribe((orgs) => {
      this.org = orgs.find((o) => o.personal) || orgs[0] || null;
    });
    this.loadUsage();
    this.domainsService
      .getTarget()
      .subscribe({ next: (t) => (this.domainTarget = t.target) });
  }

  private loadUsage() {
    this.http
      .get<{
        hasPlan: boolean;
        plan: string | null;
        limits: { maxCustomDomains: number } | null;
      }>(`${runtimeConfig.apiUrl}/plans/usage`)
      .subscribe({
        next: (usage) => {
          this.planName = usage.hasPlan && usage.plan ? usage.plan : 'None';
          this.maxCustomDomains = usage.limits?.maxCustomDomains ?? 0;
          if (this.maxCustomDomains !== 0) this.loadDomains();
        },
        error: () => {
          this.planName = 'None';
          this.maxCustomDomains = 0;
        },
      });
  }

  private loadDomains() {
    this.domainsService.getDomains().subscribe({
      next: (domains) => (this.domains = domains),
      error: () => (this.domains = []),
    });
  }

  addDomain() {
    const hostname = this.newDomain.trim();
    if (!hostname || this.addingDomain) return;

    this.addingDomain = true;
    this.domainError = '';
    this.domainsService.addDomain(hostname).subscribe({
      next: (domain) => {
        this.domains = [...this.domains, domain];
        this.newDomain = '';
        this.addingDomain = false;
      },
      error: (err) => {
        this.domainError =
          err?.error?.message ?? 'Could not add that domain.';
        this.addingDomain = false;
      },
    });
  }

  /** "Check now" — the hourly sweep would get there eventually. */
  verifyDomain(domain: CustomDomain) {
    this.verifyingId = domain.id;
    this.domainError = '';
    this.domainsService.verifyDomain(domain.id).subscribe({
      next: (updated) => {
        this.domains = this.domains.map((d) =>
          d.id === updated.id ? updated : d,
        );
        this.verifyingId = null;
      },
      error: (err) => {
        this.domainError =
          err?.error?.message ?? 'Could not check that domain.';
        this.verifyingId = null;
      },
    });
  }

  removeDomain(domain: CustomDomain) {
    this.domainsService.removeDomain(domain.id).subscribe({
      next: () => {
        this.domains = this.domains.filter((d) => d.id !== domain.id);
      },
      error: (err) => {
        this.domainError =
          err?.error?.message ?? 'Could not remove that domain.';
      },
    });
  }

  /** The label a customer types into the Name/Host field at their registrar. */
  cnameLabel(hostname: string): string {
    return hostname.split('.')[0];
  }

  domainStatusLabel(domain: CustomDomain): string {
    switch (domain.status) {
      case 'active':
        return 'Live';
      case 'pending':
        return 'Waiting for DNS';
      default:
        return 'Not working';
    }
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
