import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PaymentsService } from '../payments.service';

type PayState = 'loading' | 'opened' | 'no-transaction' | 'error';

/**
 * Paddle's "default payment link" target.
 *
 * Paddle sends customers here — never our own app — whenever it needs a payment
 * completed outside the pricing page: dunning emails for a past_due
 * subscription, update-payment-method redirects out of the customer portal, and
 * invoice checkouts. It appends `?_ptxn=<transaction id>`, and Paddle.js opens
 * the overlay for that transaction on its own once it initialises. So this page
 * deliberately does nothing but load the script; there is no Checkout.open()
 * call to make, because the transaction isn't ours to name.
 *
 * It must stay outside authGuard: someone clicking a failed-renewal email is
 * often not signed in, and bouncing them to /login loses the transaction.
 */
@Component({
  selector: 'app-pay',
  imports: [RouterLink],
  template: `
    <div class="pay-page">
      <div class="pay-card">
        @switch (state) {
          @case ('loading') {
            <div class="spinner" aria-hidden="true"></div>
            <h1>Opening secure checkout</h1>
            <p>One moment while we load Paddle's payment form.</p>
          }
          @case ('opened') {
            <h1>Complete your payment</h1>
            <p>
              The secure checkout should be open. If you don't see it, check for
              a blocked pop-up, then reload this page.
            </p>
          }
          @case ('no-transaction') {
            <h1>Nothing to pay here</h1>
            <p>
              This page finishes a payment started from a link we emailed you.
              Open that link again, or pick a plan to get started.
            </p>
            <a routerLink="/pricing" class="btn btn-primary">View plans</a>
          }
          @case ('error') {
            <h1>We couldn't open the checkout</h1>
            <p>
              Something went wrong loading the payment form. Reload the page to
              try again — if it keeps happening, email
              <a href="mailto:support&#64;ez-snippets.com">support&#64;ez-snippets.com</a>
              and we'll sort it out.
            </p>
          }
        }
      </div>
    </div>
  `,
  styles: `
    .pay-page {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 60vh;
      padding: 2rem;
    }
    .pay-card {
      text-align: center;
      max-width: 480px;
      padding: 3rem 2rem;
      border: 1px solid #e0e0e0;
      border-radius: 12px;
      background: white;
    }
    .spinner {
      width: 40px;
      height: 40px;
      margin: 0 auto 1.5rem;
      border: 3px solid #e0e0e0;
      border-top-color: #3498db;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .spinner {
        animation-duration: 3s;
      }
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
    .btn-primary:hover {
      background-color: #2980b9;
    }
  `,
})
export class Pay implements OnInit {
  private route = inject(ActivatedRoute);
  private payments = inject(PaymentsService);

  state: PayState = 'loading';

  async ngOnInit(): Promise<void> {
    // Without a transaction id there is nothing for Paddle.js to open, so say
    // so rather than leaving someone on a spinner that will never resolve.
    if (!this.route.snapshot.queryParamMap.get('_ptxn')) {
      this.state = 'no-transaction';
      return;
    }

    try {
      await this.payments.loadPaddleForPaymentLink();
      this.state = 'opened';
    } catch {
      this.state = 'error';
    }
  }
}
