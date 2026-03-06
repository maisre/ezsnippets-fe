import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PaymentsService } from '../payments.service';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-pricing',
  imports: [],
  templateUrl: './pricing.html',
  styleUrl: './pricing.css',
})
export class Pricing {
  private paymentsService = inject(PaymentsService);
  private authService = inject(AuthService);
  private router = inject(Router);

  billingPeriod: 'monthly' | 'yearly' = 'monthly';

  plans = [
    {
      name: 'Basic',
      description: 'Perfect for trying things out.',
      monthly: 10,
      yearly: 100,
      monthlyPriceId: 'price_1T7oWwBCIaRH2MSXeaIC22S7',
      yearlyPriceId: 'price_1T7oWyBCIaRH2MSXa7dFawYC',
      features: [
        'Up to 3 pages',
        '1 layout',
        'Community snippets',
        'Basic AI customization',
      ],
      featured: false,
      cta: 'Get Started',
      ctaStyle: 'btn btn-outline',
    },
    {
      name: 'Pro',
      description: 'For freelancers and small teams.',
      monthly: 25,
      yearly: 250,
      monthlyPriceId: 'price_1T7oX0BCIaRH2MSX8fA87eOt',
      yearlyPriceId: 'price_1T7oX1BCIaRH2MSX9EqkbIi9',
      features: [
        'Unlimited pages',
        'Unlimited layouts',
        'All snippets',
        'AI customization',
        'Custom CSS/JS overrides',
        'Priority support',
      ],
      featured: true,
      cta: 'Start Free Trial',
      ctaStyle: 'btn btn-primary',
    },
    {
      name: 'Enterprise',
      description: 'For agencies and larger teams.',
      monthly: 50,
      yearly: 500,
      monthlyPriceId: 'price_1T7oX3BCIaRH2MSXeILwubbY',
      yearlyPriceId: 'price_1T7oX5BCIaRH2MSX4MpR0WmU',
      features: [
        'Everything in Pro',
        'Team workspaces',
        'Custom snippet uploads',
        'White-label publishing',
        'API access',
        'Dedicated support',
      ],
      featured: false,
      cta: 'Contact Sales',
      ctaStyle: 'btn btn-outline',
    },
  ];

  toggleBilling() {
    this.billingPeriod = this.billingPeriod === 'monthly' ? 'yearly' : 'monthly';
  }

  getPrice(plan: any): number {
    return this.billingPeriod === 'monthly' ? plan.monthly : plan.yearly;
  }

  getPriceId(plan: any): string {
    return this.billingPeriod === 'monthly' ? plan.monthlyPriceId : plan.yearlyPriceId;
  }

  selectPlan(plan: any) {
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
