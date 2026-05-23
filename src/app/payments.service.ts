import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { runtimeConfig } from './runtime-config';
import { Observable } from 'rxjs';

declare global {
  interface Window {
    Paddle?: any;
  }
}

@Injectable({
  providedIn: 'root',
})
export class PaymentsService {
  private http = inject(HttpClient);
  private paddleLoad?: Promise<void>;

  createCheckoutSession(priceId: string): Observable<{ transactionId: string }> {
    return this.http.post<{ transactionId: string }>(
      `${runtimeConfig.apiUrl}/payments/checkout`,
      { priceId },
    );
  }

  cancelSubscription(): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(
      `${runtimeConfig.apiUrl}/payments/cancel-subscription`,
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

  private loadPaddle(): Promise<void> {
    if (this.paddleLoad) return this.paddleLoad;

    this.paddleLoad = new Promise<void>((resolve, reject) => {
      if (window.Paddle) {
        this.initPaddle();
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
      script.async = true;
      script.onload = () => {
        this.initPaddle();
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load Paddle.js'));
      document.head.appendChild(script);
    });
    return this.paddleLoad;
  }

  // Sandbox client tokens are prefixed `test_`; live tokens are `live_`.
  private initPaddle(): void {
    const token = runtimeConfig.paddleClientToken;
    if (token.startsWith('test_')) {
      window.Paddle!.Environment.set('sandbox');
    }
    window.Paddle!.Initialize({ token });
  }
}
