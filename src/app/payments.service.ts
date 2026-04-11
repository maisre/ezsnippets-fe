import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { runtimeConfig } from './runtime-config';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class PaymentsService {
  private http = inject(HttpClient);

  getProducts(): Observable<any[]> {
    return this.http.get<any[]>(`${runtimeConfig.apiUrl}/payments/products`);
  }

  createCheckoutSession(priceId: string): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(
      `${runtimeConfig.apiUrl}/payments/checkout`,
      {
        priceId,
        successUrl: `${window.location.origin}/checkout/success`,
        cancelUrl: `${window.location.origin}/pricing`,
      },
    );
  }

  cancelSubscription(): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(
      `${runtimeConfig.apiUrl}/payments/cancel-subscription`,
      {},
    );
  }
}
