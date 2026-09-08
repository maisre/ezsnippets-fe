import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { runtimeConfig } from './runtime-config';
import { PaymentsService } from './payments.service';

export interface PlanUsage {
  hasPlan: boolean;
  plan: string | null;
  limits: {
    maxPages: number;
    maxLayouts: number;
    maxSeats: number;
    maxCustomDomains: number;
    maxSavedTemplates: number;
    aiDailyLimit: number;
  } | null;
  usage: { pages: number; layouts: number } | null;
  /** Paddle customer id (`ctm_...`), or null before the first purchase. */
  paddleCustomerId: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class PlansService {
  private http = inject(HttpClient);
  private payments = inject(PaymentsService);

  /**
   * Also the single place the Paddle customer id reaches PaymentsService.
   * Every signed-in surface that cares about plans already calls this, so
   * handing it over here keeps Retain attribution working without asking each
   * component to remember to do it.
   */
  getUsage(): Observable<PlanUsage> {
    return this.http
      .get<PlanUsage>(`${runtimeConfig.apiUrl}/plans/usage`)
      .pipe(tap((u) => this.payments.setPaddleCustomer(u.paddleCustomerId)));
  }
}
