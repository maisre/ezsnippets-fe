import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { PaymentsService } from '../payments.service';
import { AuthService } from '../auth.service';
import { environment } from '../../environments/environment';

interface PlanConfig {
  id: string;
  name: string;
  priceIds: string[];
  limits: { maxPages: number; maxLayouts: number; maxSnippets: number };
}

interface DisplayPlan {
  name: string;
  description: string;
  monthly: number;
  yearly: number;
  monthlyPriceId: string;
  yearlyPriceId: string;
  features: string[];
  featured: boolean;
  cta: string;
  ctaStyle: string;
}

// Hard-coded display info keyed by plan price IDs
const PLAN_DISPLAY: Record<
  string,
  { description: string; monthly: number; yearly: number; featured: boolean; cta: string; ctaStyle: string; extraFeatures: string[] }
> = {
  price_1T7oWwBCIaRH2MSXeaIC22S7: {
    description: 'Perfect for trying things out.',
    monthly: 10,
    yearly: 100,
    featured: false,
    cta: 'Get Started',
    ctaStyle: 'btn btn-outline',
    extraFeatures: ['Community snippets', 'Basic AI customization'],
  },
  price_1T7oX0BCIaRH2MSX8fA87eOt: {
    description: 'For freelancers and small teams.',
    monthly: 25,
    yearly: 250,
    featured: true,
    cta: 'Start Free Trial',
    ctaStyle: 'btn btn-primary',
    extraFeatures: ['AI customization', 'Custom CSS/JS overrides', 'Priority support'],
  },
  price_1T7oX3BCIaRH2MSXeILwubbY: {
    description: 'For agencies and larger teams.',
    monthly: 50,
    yearly: 500,
    featured: false,
    cta: 'Contact Sales',
    ctaStyle: 'btn btn-outline',
    extraFeatures: ['Everything in Pro', 'Team workspaces', 'Custom snippet uploads', 'White-label publishing', 'API access', 'Dedicated support'],
  },
};

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

  billingPeriod: 'monthly' | 'yearly' = 'monthly';
  plans: DisplayPlan[] = [];

  ngOnInit() {
    this.http.get<PlanConfig[]>(`${environment.apiUrl}/plans`).subscribe({
      next: (configs) => this.buildPlans(configs),
      error: () => this.buildFallbackPlans(),
    });
  }

  private buildPlans(configs: PlanConfig[]) {
    this.plans = configs.map((config) => {
      const monthlyId = config.priceIds[0];
      const yearlyId = config.priceIds[1] || config.priceIds[0];
      const display = PLAN_DISPLAY[monthlyId];

      const limitFeatures = this.formatLimits(config.limits);

      return {
        name: config.name,
        description: display?.description || '',
        monthly: display?.monthly || 0,
        yearly: display?.yearly || 0,
        monthlyPriceId: monthlyId,
        yearlyPriceId: yearlyId,
        features: [...limitFeatures, ...(display?.extraFeatures || [])],
        featured: display?.featured || false,
        cta: display?.cta || 'Get Started',
        ctaStyle: display?.ctaStyle || 'btn btn-outline',
      };
    });
  }

  private formatLimits(limits: PlanConfig['limits']): string[] {
    const features: string[] = [];
    features.push(limits.maxPages === -1 ? 'Unlimited pages' : `Up to ${limits.maxPages} pages`);
    features.push(limits.maxLayouts === -1 ? 'Unlimited layouts' : `${limits.maxLayouts} layout${limits.maxLayouts !== 1 ? 's' : ''}`);
    features.push(limits.maxSnippets === -1 ? 'All snippets' : `Up to ${limits.maxSnippets} snippets`);
    return features;
  }

  private buildFallbackPlans() {
    // Hardcoded fallback in case API is unreachable
    this.plans = [
      {
        name: 'Basic',
        description: 'Perfect for trying things out.',
        monthly: 10, yearly: 100,
        monthlyPriceId: 'price_1T7oWwBCIaRH2MSXeaIC22S7',
        yearlyPriceId: 'price_1T7oWyBCIaRH2MSXa7dFawYC',
        features: ['Up to 3 pages', '1 layout', 'Up to 50 snippets', 'Community snippets', 'Basic AI customization'],
        featured: false, cta: 'Get Started', ctaStyle: 'btn btn-outline',
      },
      {
        name: 'Pro',
        description: 'For freelancers and small teams.',
        monthly: 25, yearly: 250,
        monthlyPriceId: 'price_1T7oX0BCIaRH2MSX8fA87eOt',
        yearlyPriceId: 'price_1T7oX1BCIaRH2MSX9EqkbIi9',
        features: ['Up to 25 pages', '10 layouts', 'Up to 500 snippets', 'AI customization', 'Custom CSS/JS overrides', 'Priority support'],
        featured: true, cta: 'Start Free Trial', ctaStyle: 'btn btn-primary',
      },
      {
        name: 'Enterprise',
        description: 'For agencies and larger teams.',
        monthly: 50, yearly: 500,
        monthlyPriceId: 'price_1T7oX3BCIaRH2MSXeILwubbY',
        yearlyPriceId: 'price_1T7oX5BCIaRH2MSX4MpR0WmU',
        features: ['Unlimited pages', 'Unlimited layouts', 'All snippets', 'Everything in Pro', 'Team workspaces', 'Custom snippet uploads', 'White-label publishing', 'API access', 'Dedicated support'],
        featured: false, cta: 'Contact Sales', ctaStyle: 'btn btn-outline',
      },
    ];
  }

  toggleBilling() {
    this.billingPeriod = this.billingPeriod === 'monthly' ? 'yearly' : 'monthly';
  }

  getPrice(plan: DisplayPlan): number {
    return this.billingPeriod === 'monthly' ? plan.monthly : plan.yearly;
  }

  getPriceId(plan: DisplayPlan): string {
    return this.billingPeriod === 'monthly' ? plan.monthlyPriceId : plan.yearlyPriceId;
  }

  selectPlan(plan: DisplayPlan) {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/signup']);
      return;
    }

    const priceId = this.getPriceId(plan);
    this.paymentsService.createCheckoutSession(priceId).subscribe({
      next: (res) => {
        if (res.url) {
          window.location.href = res.url;
        }
      },
      error: (err) => {
        console.error('Checkout error:', err);
      },
    });
  }
}
