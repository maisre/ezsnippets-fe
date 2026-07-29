import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { PaymentsService } from '../payments.service';
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
  limits: { maxPages: number; maxLayouts: number; maxSnippets: number };
  prices: Partial<Record<BillingInterval, CatalogPrice>>;
}

interface Catalog {
  plans: CatalogPlan[];
  source: 'live' | 'cache' | 'unavailable';
}

@Component({
  selector: 'app-pricing',
  imports: [],
  templateUrl: './pricing.html',
  styleUrl: './pricing.css',
})
export class Pricing implements OnInit {
  private http = inject(HttpClient);
  private paymentsService = inject(PaymentsService);
  private authService = inject(AuthService);
  private router = inject(Router);

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

  ngOnInit() {
    this.http.get<Catalog>(`${runtimeConfig.apiUrl}/plans`).subscribe({
      next: (catalog) => {
        this.plans = catalog.plans ?? [];
        this.unavailable =
          catalog.source === 'unavailable' || this.plans.length === 0;
        this.loading = false;
      },
      error: () => {
        this.unavailable = true;
        this.loading = false;
      },
    });
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
    if (!trial) return null;
    // "7 day free trial", matching Paddle's own checkout wording. The unit is
    // adjectival here, so it stays singular however many there are — "7-days
    // free trial" was the previous output.
    return `${trial.frequency} ${trial.interval} free trial`;
  }

  limitFeatures(plan: CatalogPlan): string[] {
    const { maxPages, maxLayouts, maxSnippets } = plan.limits;
    return [
      maxPages === -1 ? 'Unlimited pages' : `Up to ${maxPages} pages`,
      maxLayouts === -1
        ? 'Unlimited layouts'
        : `${maxLayouts} layout${maxLayouts !== 1 ? 's' : ''}`,
      maxSnippets === -1 ? 'All snippets' : `Up to ${maxSnippets} snippets`,
    ];
  }

  ctaClass(plan: CatalogPlan): string {
    return plan.featured ? 'btn btn-primary' : 'btn btn-outline';
  }

  selectPlan(plan: CatalogPlan) {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/signup']);
      return;
    }

    const price = this.priceFor(plan);
    if (!price) return;

    this.checkoutError = '';
    this.opening = plan.name;

    this.paymentsService.createCheckoutSession(price.id).subscribe({
      next: (res) => {
        this.paymentsService
          .openCheckout(res.transactionId)
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
        console.error('Checkout error:', err);
        this.checkoutError = 'Could not start checkout. Please try again.';
        this.opening = null;
      },
    });
  }

  private onlyPrice(plan: CatalogPlan): CatalogPrice | null {
    return plan.prices.month ?? plan.prices.year ?? null;
  }
}
