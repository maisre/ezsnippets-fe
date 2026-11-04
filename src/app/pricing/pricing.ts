import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { BillingState, PaymentsService, PlanChangePreview } from '../payments.service';
import { AuthService } from '../auth.service';
import { runtimeConfig } from '../runtime-config';

type BillingInterval = 'month' | 'year';

interface CatalogPrice {
  id: string;
  amount: string;
  currency: string;
  trial: { interval: string; frequency: number } | null;
}

interface CatalogPlan {
  name: string;
  description: string;
  features: string[];
  featured: boolean;
  cta: string;
  limits: {
    maxPages: number;
    maxLayouts: number;
    maxSeats: number;
    maxCustomDomains: number;
    maxSavedTemplates: number;
    aiDailyLimit: number;
  };
  prices: Partial<Record<BillingInterval, CatalogPrice>>;
}

interface Catalog {
  plans: CatalogPlan[];
  source: 'live' | 'cache' | 'unavailable';
}

@Component({
  selector: 'app-pricing',
  imports: [RouterLink],
  templateUrl: './pricing.html',
  styleUrl: './pricing.css',
})
export class Pricing implements OnInit {
  private http = inject(HttpClient);
  private paymentsService = inject(PaymentsService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  interval: BillingInterval = 'month';
  plans: CatalogPlan[] = [];
  loading = true;
  /**
   * Set when the catalog can't be read. There is deliberately no hardcoded
   * fallback price list any more: serving stale price ids against a live
   * Paddle account is worse than asking someone to come back in a minute.
   */
  unavailable = false;
  checkoutError = '';
  /** Name of the plan whose checkout is being opened, for the button state. */
  opening: string | null = null;

  /**
   * Set when an existing subscriber picks a team plan: the API refuses a
   * second checkout and we offer to move their subscription instead.
   */
  upgradeOffer: {
    priceId: string;
    plan: string;
    amountDueToday: string;
    currency: string;
  } | null = null;
  upgrading = false;

  /**
   * The signed-in caller's own subscription and trial eligibility. Null while
   * loading or when signed out — both read as "new visitor": trial shown,
   * checkout buttons.
   */
  billing: BillingState | null = null;
  private billingLoaded = false;
  private resumed = false;
  /** Set while previewing a switch between single-seat plans. */
  planChangeOffer: (PlanChangePreview & { priceId: string }) | null = null;
  changingPlan = false;
  /** One line confirming a plan change that just went through. */
  planChangeNotice = '';

  ngOnInit() {
    this.loadBilling();
    this.http.get<Catalog>(`${runtimeConfig.apiUrl}/plans`).subscribe({
      next: (catalog) => {
        this.plans = catalog.plans ?? [];
        this.unavailable =
          catalog.source === 'unavailable' || this.plans.length === 0;
        this.loading = false;
        this.resumeChosenPlan();
      },
      error: () => {
        this.unavailable = true;
        this.loading = false;
      },
    });
  }

  private loadBilling() {
    if (!this.authService.isAuthenticated()) {
      this.billingLoaded = true;
      return;
    }
    this.paymentsService.billingState().subscribe({
      next: (state) => {
        this.billing = state;
        this.billingLoaded = true;
        this.resumeChosenPlan();
      },
      // Without it the page behaves as for a new visitor; the API still
      // refuses a second subscription and decides the trial itself.
      error: () => {
        this.billingLoaded = true;
        this.resumeChosenPlan();
      },
    });
  }

  /** Whether trial wording applies: signed out, or never subscribed. */
  get showTrial(): boolean {
    return !this.billing || (this.billing.trialEligible && !this.billing.current);
  }

  /** Their single-seat subscription, when they have one this page can change. */
  private get current(): BillingState['current'] {
    return this.billing?.current ?? null;
  }

  private intervalOf(plan: CatalogPlan): BillingInterval {
    return plan.prices[this.interval] ? this.interval : plan.prices.month ? 'month' : 'year';
  }

  private matches(plan: CatalogPlan, name: string | undefined): boolean {
    const interval = this.current?.interval;
    return plan.name === name && (!interval || interval === this.intervalOf(plan));
  }

  /**
   * The card for what they're on. During a scheduled switch to a cheaper plan
   * that's the plan they're moving to (it's what Paddle bills next); the plan
   * they're leaving becomes "Keep …", which undoes the switch.
   */
  isCurrentPlan(plan: CatalogPlan): boolean {
    const current = this.current;
    if (!current) return false;
    const pending = current.scheduledSwitch;
    return pending ? this.matches(plan, pending.toPlan) : this.matches(plan, current.plan);
  }

  ctaLabel(plan: CatalogPlan): string {
    if (this.opening === plan.name) return 'Opening...';
    const current = this.current;
    if (current && plan.limits.maxSeats <= 1) {
      const pending = current.scheduledSwitch;
      if (pending && this.isCurrentPlan(plan)) return `Starts ${this.formatDate(pending.effectiveAt)}`;
      if (pending && this.matches(plan, current.plan)) return `Keep ${plan.name}`;
      if (this.isCurrentPlan(plan)) return 'Current plan';
      const rank = (name: string) => this.plans.findIndex((p) => p.name === name);
      const higher =
        rank(plan.name) > rank(current.plan) ||
        (plan.name === current.plan && this.intervalOf(plan) === 'year');
      return current.status !== 'trialing' && higher
        ? `Upgrade to ${plan.name}`
        : `Switch to ${plan.name}`;
    }
    // A team plan for a subscriber goes through the existing upgrade offer.
    if (current) return `Upgrade to ${plan.name}`;
    const trial = this.priceFor(plan)?.trial;
    if (this.showTrial && trial) {
      return `Start ${trial.frequency}-${trial.interval} free trial`;
    }
    return this.billing ? 'Subscribe' : plan.cta;
  }

  /** Picks up a plan chosen before signing up — see selectPlan. Runs once. */
  private resumeChosenPlan() {
    // Needs both the catalog and the billing state to pick the right action.
    if (this.loading || !this.billingLoaded || this.resumed) return;
    this.resumed = true;
    const params = this.route.snapshot.queryParamMap;
    const name = params.get('plan');
    if (!name || !this.authService.isAuthenticated()) return;
    const interval = params.get('interval');
    if (interval === 'month' || interval === 'year') this.interval = interval;
    // Drop the params so a reload or back-navigation doesn't reopen checkout.
    this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    const plan = this.plans.find((p) => p.name === name);
    if (plan) this.selectPlan(plan);
  }

  toggleBilling() {
    this.interval = this.interval === 'month' ? 'year' : 'month';
  }

  /** The price for the selected interval, falling back to the plan's only one. */
  priceFor(plan: CatalogPlan): CatalogPrice | null {
    return plan.prices[this.interval] ?? this.onlyPrice(plan);
  }

  /**
   * True when a plan isn't sold on the interval currently selected. The card
   * still renders with the interval it does have — silently dropping a tier
   * when the toggle flips is worse than showing it with one option.
   */
  isIntervalMismatch(plan: CatalogPlan): boolean {
    return !plan.prices[this.interval] && !!this.onlyPrice(plan);
  }

  intervalLabelFor(plan: CatalogPlan): string {
    return plan.prices.month && !plan.prices.year
      ? 'Billed monthly only'
      : 'Billed yearly only';
  }

  /**
   * The suffix must describe the price actually being shown. When a plan isn't
   * sold on the selected interval we fall back to its only price, and labelling
   * a yearly amount "/mo" misprices it by a factor of twelve.
   */
  periodSuffix(plan: CatalogPlan): string {
    if (plan.prices[this.interval]) {
      return this.interval === 'month' ? 'mo' : 'yr';
    }
    return plan.prices.month ? 'mo' : 'yr';
  }

  yearlySaving(plan: CatalogPlan): string | null {
    const monthly = plan.prices.month;
    const yearly = plan.prices.year;
    if (this.interval !== 'year' || !monthly || !yearly) return null;
    const saved = Number(monthly.amount) * 12 - Number(yearly.amount);
    return saved > 0 ? saved.toFixed(2) : null;
  }

  trialLabel(plan: CatalogPlan): string | null {
    const trial = this.priceFor(plan)?.trial;
    // The trial is once per customer — the API leaves it off their checkout.
    if (!trial || !this.showTrial) return null;
    // "7 day free trial", matching Paddle's own checkout wording. The unit is
    // adjectival here, so it stays singular however many there are — "7-days
    // free trial" was the previous output.
    return `${trial.frequency} ${trial.interval} free trial`;
  }

  limitFeatures(plan: CatalogPlan): string[] {
    const {
      maxPages,
      maxLayouts,
      maxSeats,
      maxCustomDomains,
      maxSavedTemplates,
      aiDailyLimit,
    } = plan.limits;

    // Pages and layouts are concurrency limits — archiving a finished project
    // gives the slot back — so they read as "active", not as a lifetime cap.
    const features = [
      maxLayouts === -1
        ? 'Unlimited active layouts'
        : `${maxLayouts} active layout${maxLayouts !== 1 ? 's' : ''}`,
      maxPages === -1 ? 'Unlimited pages' : `Up to ${maxPages} pages`,
      maxSeats === -1 ? 'Unlimited seats' : `${maxSeats} seat${maxSeats !== 1 ? 's' : ''}`,
      `${aiDailyLimit} AI requests/day`,
    ];

    // Saving your own templates is on or off; the number behind it is either
    // "none" or "as many as you like", so a count would read as noise.
    if (maxSavedTemplates !== 0) {
      features.push('Save your own templates');
    }

    // Omitted rather than shown as "0 custom domains" — an absent capability
    // shouldn't take up a line on the tier that doesn't have it.
    if (maxCustomDomains > 0) {
      features.push(
        maxCustomDomains === 1
          ? 'Custom preview domain'
          : `${maxCustomDomains} custom preview domains`,
      );
    }

    return features;
  }

  ctaClass(plan: CatalogPlan): string {
    return plan.featured ? 'btn btn-primary' : 'btn btn-outline';
  }

  selectPlan(plan: CatalogPlan) {
    if (!this.authService.isAuthenticated()) {
      // Come back here with the choice intact, and checkout opens straight
      // away (resumeChosenPlan) instead of dropping them on the dashboard.
      const back = `/pricing?plan=${encodeURIComponent(plan.name)}&interval=${this.interval}`;
      this.router.navigate(['/signup'], { queryParams: { returnUrl: back } });
      return;
    }

    const price = this.priceFor(plan);
    if (!price) return;

    // A subscriber moving between single-seat plans changes the subscription
    // they have rather than checking out a second one.
    if (this.current && plan.limits.maxSeats <= 1) {
      if (!this.isCurrentPlan(plan)) this.offerPlanChange(price.id, plan.name);
      return;
    }

    this.checkoutError = '';
    this.opening = plan.name;

    this.upgradeOffer = null;
    this.planChangeOffer = null;
    this.paymentsService.createCheckoutSession(price.id).subscribe({
      next: (res) => {
        this.paymentsService
          .openCheckout(res.transactionId, res.orgId, res.customerEmail)
          .catch((err) => {
            // Anything that stops the overlay opening has to be visible: a
            // checkout that fails silently reads as a dead button.
            console.error('Failed to open checkout:', err);
            this.checkoutError =
              'Could not open checkout. Please try again, or contact support if it keeps happening.';
          })
          .finally(() => (this.opening = null));
      },
      error: (err) => {
        if (err?.status === 409 && err.error?.code === 'UPGRADE_AVAILABLE') {
          this.offerUpgrade(price.id);
          return;
        }
        console.error('Checkout error:', err);
        // 409s carry a sentence meant for the customer ("already includes
        // Pro", "already has a plan"); anything else gets the generic line.
        this.checkoutError =
          err?.status === 409 && err.error?.message
            ? err.error.message
            : 'Could not start checkout. Please try again.';
        this.opening = null;
      },
    });
  }

  private offerPlanChange(priceId: string, planName: string) {
    this.checkoutError = '';
    this.planChangeNotice = '';
    this.upgradeOffer = null;
    this.planChangeOffer = null;
    this.opening = planName;
    this.paymentsService.previewPlanChange(priceId).subscribe({
      next: (preview) => {
        this.planChangeOffer = { priceId, ...preview };
        this.opening = null;
      },
      error: (err) => {
        this.checkoutError =
          err?.error?.message ?? 'Could not price that change. Please try again.';
        this.opening = null;
      },
    });
  }

  confirmPlanChange() {
    if (!this.planChangeOffer || this.changingPlan) return;
    const offer = this.planChangeOffer;
    this.changingPlan = true;
    this.checkoutError = '';
    this.paymentsService.changePlan(offer.priceId).subscribe({
      next: (res) => {
        this.changingPlan = false;
        this.planChangeOffer = null;
        this.planChangeNotice =
          res.kind === 'downgrade' && res.effectiveAt
            ? `Done — you'll move to ${res.plan} on ${this.formatDate(res.effectiveAt)}. You keep ${offer.currentPlan} until then.`
            : `Done — you're on ${res.plan} now.`;
        this.loadBilling();
      },
      error: (err) => {
        this.changingPlan = false;
        this.checkoutError =
          err?.error?.message ?? 'The change did not go through. You have not been charged.';
      },
    });
  }

  formatDate(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  private offerUpgrade(priceId: string) {
    this.paymentsService.previewUpgrade(priceId).subscribe({
      next: (preview) => {
        this.upgradeOffer = { priceId, ...preview };
        this.opening = null;
      },
      error: (err) => {
        this.checkoutError =
          err?.error?.message ?? 'Could not price the upgrade. Please try again.';
        this.opening = null;
      },
    });
  }

  /** Moves the subscription onto a new team workspace and switches into it. */
  confirmUpgrade() {
    if (!this.upgradeOffer || this.upgrading) return;
    this.upgrading = true;
    this.checkoutError = '';
    this.paymentsService.upgradeToTeam(this.upgradeOffer.priceId).subscribe({
      next: ({ orgId }) => {
        this.authService.switchOrg(orgId).subscribe({
          next: (res) => this.authService.enterWorkspace(res.access_token, '/team'),
          error: () => this.router.navigate(['/account']),
        });
      },
      error: (err) => {
        this.upgrading = false;
        this.checkoutError =
          err?.error?.message ?? 'The upgrade did not go through. You have not been charged.';
      },
    });
  }

  private onlyPrice(plan: CatalogPlan): CatalogPrice | null {
    return plan.prices.month ?? plan.prices.year ?? null;
  }
}
