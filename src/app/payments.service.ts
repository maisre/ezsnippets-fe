import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../environments/environment';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class PaymentsService {
  private http = inject(HttpClient);

  getProducts(): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/payments/products`);
  }

  createCheckoutSession(priceId: string): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(
      `${environment.apiUrl}/payments/checkout`,
      {
        priceId,
        successUrl: `${window.location.origin}/checkout/success`,
        cancelUrl: `${window.location.origin}/pricing`,
      },
    );
  }

  cancelSubscription(): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(
      `${environment.apiUrl}/payments/cancel-subscription`,
      {},
    );
  }
}
