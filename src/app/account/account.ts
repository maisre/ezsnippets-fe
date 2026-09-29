import { Component, HostListener, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { runtimeConfig } from '../runtime-config';
import { OrgsService } from '../orgs.service';
import { PaymentsService, TeamDowngradePreview } from '../payments.service';
import { formatDate, teamClosesAt } from '../workspace-status';
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

  /** Adding/removing domains is owner/admin only (ez-api enforces it too). */
  get canManageDomains(): boolean {
    return this.org?.role === 'owner' || this.org?.role === 'admin';
  }

  get canAddDomain(): boolean {
    return (
      this.maxCustomDomains === -1 ||
      this.domains.length < this.maxCustomDomains
    );
  }

  /**
   * 'team-owner' when this personal workspace's plan is included with a team
   * subscription the user owns — there's no billing here to manage then.
   */
  planSource: 'subscription' | 'team-owner' | null = null;

  ngOnInit() {
    this.loadOrg();
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
        planSource?: 'subscription' | 'team-owner';
        limits: { maxCustomDomains: number } | null;
      }>(`${runtimeConfig.apiUrl}/plans/usage`)
      .subscribe({
        next: (usage) => {
          this.planName = usage.hasPlan && usage.plan ? usage.plan : 'None';
          this.planSource = usage.planSource ?? null;
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

  // --- Team -> Pro downgrade (team owner only) ---
  // Loaded only when the owner opens it: the preview reads the live Paddle
  // subscription, which isn't worth doing on every account page view.
  downgrade: TeamDowngradePreview | null = null;
  downgradeOpen = false;
  downgradeBusy = false;
  downgradeError = '';
  keepDomainId: string | null = null;
  downgradeAcknowledged = false;

  /** When this team closes, if it's scheduled to — for everyone's benefit. */
  get closesAt(): string | null {
    const date = teamClosesAt(this.org);
    return date ? formatDate(date) : null;
  }

  /** A downgraded team still inside the period it paid for. */
  get downgradePending(): boolean {
    const until = this.org?.scheduledDowngrade?.until;
    return !!until && Date.parse(until) > Date.now();
  }

  /** Owner of an active team plan that can still be moved down. */
  get canDowngradeTeam(): boolean {
    return (
      !!this.org &&
      !this.org.personal &&
      this.isOwner &&
      this.org.subscriptionStatus === 'active' &&
      !this.org.cancelAtPeriodEnd
    );
  }

  openDowngrade() {
    if (!this.org) return;
    this.downgradeOpen = true;
    this.downgradeError = '';
    this.downgradeAcknowledged = false;
    this.keepDomainId = null;
    this.loadDowngrade();
  }

  closeDowngrade() {
    this.downgradeOpen = false;
    this.downgradeError = '';
  }

  private loadDowngrade() {
    if (!this.org) return;
    this.downgrade = null;
    this.paymentsService.previewTeamDowngrade(this.org.id).subscribe({
      next: (preview) => (this.downgrade = preview),
      error: (err) => {
        this.downgradeError = err?.error?.message ?? 'Could not load your plan options. Please try again.';
      },
    });
  }

  downgradeDate(iso: string | undefined): string {
    return iso ? formatDate(new Date(iso)) : '';
  }

  confirmDowngrade() {
    if (!this.org || this.downgradeBusy || !this.downgradeAcknowledged) return;
    this.downgradeBusy = true;
    this.downgradeError = '';
    this.paymentsService.scheduleTeamDowngrade(this.org.id, this.keepDomainId).subscribe({
      next: () => {
        this.downgradeBusy = false;
        this.downgradeOpen = false;
        this.loadOrg();
        this.loadUsage();
      },
      error: (err) => {
        this.downgradeBusy = false;
        this.downgradeError = err?.error?.message ?? 'Could not change your plan. Please try again.';
      },
    });
  }

  undoDowngrade() {
    if (!this.org || this.downgradeBusy) return;
    this.downgradeBusy = true;
    this.downgradeError = '';
    this.paymentsService.cancelTeamDowngrade(this.org.id).subscribe({
      next: () => {
        this.downgradeBusy = false;
        this.loadOrg();
        this.loadUsage();
      },
      error: (err) => {
        this.downgradeBusy = false;
        this.downgradeError = err?.error?.message ?? 'Could not keep the team plan. Please try again.';
      },
    });
  }

  getStatusLabel(): string {
    if (this.downgradePending) return `Moving to ${this.org?.scheduledDowngrade?.toPlan ?? 'Pro'}`;
    if (!this.org?.subscriptionStatus) return 'No subscription';
    const s = this.org.subscriptionStatus;
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
  }

  getStatusClass(): string {
    if (this.downgradePending) return 'status-past-due';
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
  // A plan included with a team subscription is billed on the team, not here.
  canManageBilling(): boolean {
    return (
      this.org?.role === 'owner' &&
      !!this.org.paddleCustomerId &&
      !!this.org.subscriptionId
    );
  }

  /** Billing lives with the owner — members see the plan, not the card. */
  get isOwner(): boolean {
    return this.org?.role === 'owner';
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
    this.loadOrg();
  }

  // The workspace the session is scoped to — which is also the one every
  // limit and domain on this page belongs to.
  private loadOrg() {
    this.orgsService.getMyOrgs().subscribe((orgs) => {
      this.org = orgs.find((o) => o.active) || orgs[0] || null;
    });
  }
}
