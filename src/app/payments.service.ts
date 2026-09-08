import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { runtimeConfig } from './runtime-config';
import { Observable } from 'rxjs';

declare global {
  interface Window {
    Paddle?: any;
  }
}

export interface PortalSession {
  overviewUrl: string;
  updatePaymentMethodUrl?: string;
  cancelUrl?: string;
}

@Injectable({
  providedIn: 'root',
})
export class PaymentsService {
  private http = inject(HttpClient);
  private paddleLoad?: Promise<void>;
  private initialized = false;
  private pwCustomerId?: string;

  createCheckoutSession(priceId: string): Observable<{ transactionId: string }> {
    return this.http.post<{ transactionId: string }>(
      `${runtimeConfig.apiUrl}/payments/checkout`,
      { priceId },
    );
  }

  createPortalSession(): Observable<PortalSession> {
    return this.http.post<PortalSession>(
      `${runtimeConfig.apiUrl}/payments/portal-session`,
      {},
    );
  }

  async openCheckout(transactionId: string): Promise<void> {
    await this.loadPaddle();
    window.Paddle!.Checkout.open({
      transactionId,
      settings: {
        displayMode: 'overlay',
        successUrl: `${window.location.origin}/checkout/success`,
      },
    });
  }

  /**
   * Tell Paddle.js which customer is signed in, for Retain.
   *
   * Retain uses `pwCustomer` to attribute dunning and recovery to the right
   * customer, and it must be the Paddle customer id (`ctm_...`) — not our user
   * id and not an email. Orgs that have never bought anything don't have one
   * yet, which is fine: Retain has nothing to attribute until there's a
   * subscription.
   *
   * Paddle.js is loaded lazily, so this usually lands before Initialize() and
   * simply gets folded into it. When it lands after — usage resolving while a
   * checkout is already open — Initialize() won't run a second time, so
   * Update() is the only way through. Passing an empty object clears it, which
   * is what should happen on sign-out.
   */
  setPaddleCustomer(customerId: string | null | undefined): void {
    const id = customerId || undefined;
    if (id === this.pwCustomerId) return;
    this.pwCustomerId = id;

    if (this.initialized && window.Paddle?.Update) {
      window.Paddle.Update({ pwCustomer: id ? { id } : {} });
    }
  }

  /**
   * Load and initialise Paddle.js without opening anything.
   *
   * The /pay route — Paddle's "default payment link" — needs this. Paddle
   * appends `?_ptxn=<transaction id>` to that URL in dunning emails and
   * update-payment-method redirects, and Paddle.js opens the checkout for that
   * transaction by itself as soon as it initialises. All this page has to do is
   * get the script on the page; openCheckout() would be wrong there, because we
   * have no transaction id of our own to pass.
   */
  loadPaddleForPaymentLink(): Promise<void> {
    return this.loadPaddle();
  }

  private loadPaddle(): Promise<void> {
    if (this.paddleLoad) return this.paddleLoad;

    // A failed attempt must not be cached. Caching one leaves every later
    // click failing for a reason that already went away.
    this.paddleLoad = this.doLoadPaddle().catch((err) => {
      this.paddleLoad = undefined;
      throw err;
    });
    return this.paddleLoad;
  }

  /**
   * Note the shape: initPaddle() runs *outside* the promise executor.
   * Calling it inside script.onload — as this used to — meant anything it threw
   * was swallowed by the callback, leaving the promise permanently unsettled.
   * openCheckout then awaited forever: no checkout, no error, nothing logged.
   */
  private async doLoadPaddle(): Promise<void> {
    if (!window.Paddle) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () =>
          reject(new Error('Failed to load Paddle.js from cdn.paddle.com'));
        document.head.appendChild(script);
      });
    }
    this.initPaddle();
  }

  private initPaddle(): void {
    if (this.initialized) return;

    const token = runtimeConfig.paddleClientToken ?? '';
    if (!token) {
      throw new Error(
        'paddleClientToken is missing from config.json — checkout cannot open',
      );
    }
    if (!window.Paddle?.Initialize) {
      throw new Error('Paddle.js loaded but window.Paddle.Initialize is missing');
    }

    // Sandbox client tokens are prefixed `test_`; live tokens are `live_`.
    if (token.startsWith('test_')) {
      window.Paddle.Environment.set('sandbox');
    }
    window.Paddle.Initialize({
      token,
      ...(this.pwCustomerId ? { pwCustomer: { id: this.pwCustomerId } } : {}),
    });
    this.initialized = true;
  }
}
