import { Component, inject, OnInit } from '@angular/core';
import { PaymentsService } from '../payments.service';
import { runtimeConfig } from '../runtime-config';

@Component({
  selector: 'app-stripe-test',
  imports: [],
  templateUrl: './stripe-test.html',
  styleUrl: './stripe-test.css',
})
export class StripeTest implements OnInit {
  private paymentsService = inject(PaymentsService);
  private stripe: any;
  clientSecret: any;
  elements: any;

  ngOnInit(): void {
    this.invokeStripe();
  }

  preparePayment() {
    // Payment intent flow replaced by checkout session flow — see pricing component
  }

  async initialize() {
    let emailAddress = '';
    const clientSecret = this.clientSecret;
    const appearance = {
      theme: 'stripe',
    };
    this.elements = this.stripe.elements({ appearance, clientSecret });
    // const linkAuthenticationElement = this.elements.create('linkAuthentication');
    // linkAuthenticationElement.mount('#link-authentication-element');
    // linkAuthenticationElement.on('change', (event: { value: { email: string } }) => {
    //   emailAddress = event.value.email;
    // });

    const paymentElementOptions = {
      layout: 'tabs',
    };
    const paymentElement = this.elements.create('payment', paymentElementOptions);
    paymentElement.mount('#payment-element');
  }

  getProducts(): void {
    this.paymentsService.getProducts().subscribe({
      next: (products) => {
        console.log('Products:', products);
      },
      error: (error) => {
        console.error('Error fetching products:', error);
      },
    });
  }

  invokeStripe(): void {
    if (!window.document.getElementById('stripe-script')) {
      const script = window.document.createElement('script');
      script.id = 'stripe-script';
      script.type = 'text/javascript';
      script.src = 'https://js.stripe.com/clover/stripe.js';
      script.onload = () => {
        // Note: You'll need to add STRIPE_KEY to your environment files
        this.stripe = (<any>window).Stripe(runtimeConfig.stripePublishableKey);
      };
      window.document.body.appendChild(script);
    }
  }
}
