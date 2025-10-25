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

  getPaymentIntent(): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/payments/create-payment-intent`, {
      amount: 2000,
      currency: 'usd',
    });
  }
}
