import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OrgsService } from '../orgs.service';
import { PaymentsService } from '../payments.service';
import { Org } from '../models';

@Component({
  selector: 'app-account',
  imports: [RouterLink],
  templateUrl: './account.html',
  styleUrl: './account.css',
})
export class Account implements OnInit {
  private orgsService = inject(OrgsService);
  private paymentsService = inject(PaymentsService);

  org: Org | null = null;
  cancelling = false;
  showConfirm = false;

  private planNames: Record<string, string> = {
    price_1T7oWwBCIaRH2MSXeaIC22S7: 'Basic Monthly',
    price_1T7oWyBCIaRH2MSXa7dFawYC: 'Basic Yearly',
    price_1T7oX0BCIaRH2MSX8fA87eOt: 'Pro Monthly',
    price_1T7oX1BCIaRH2MSX9EqkbIi9: 'Pro Yearly',
    price_1T7oX3BCIaRH2MSXeILwubbY: 'Enterprise Monthly',
    price_1T7oX5BCIaRH2MSX4MpR0WmU: 'Enterprise Yearly',
  };

  ngOnInit() {
    this.orgsService.getMyOrgs().subscribe((orgs) => {
      this.org = orgs.find((o) => o.personal) || orgs[0] || null;
    });
  }

  getPlanName(): string {
    if (!this.org?.plan) return 'None';
    return this.planNames[this.org.plan] || this.org.plan;
  }

  getStatusLabel(): string {
    if (!this.org?.subscriptionStatus) return 'No subscription';
    const s = this.org.subscriptionStatus;
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
  }

  getStatusClass(): string {
    switch (this.org?.subscriptionStatus) {
      case 'active':
        return 'status-active';
      case 'canceled':
        return 'status-canceled';
      case 'past_due':
        return 'status-past-due';
      default:
        return 'status-none';
    }
  }

  confirmCancel() {
    this.showConfirm = true;
  }

  dismissCancel() {
    this.showConfirm = false;
  }

  cancelSubscription() {
    this.cancelling = true;
    this.paymentsService.cancelSubscription().subscribe({
      next: () => {
        if (this.org) {
          this.org = { ...this.org, subscriptionStatus: 'active' };
        }
        this.showConfirm = false;
        this.cancelling = false;
        // Reload org data to get updated status
        this.orgsService.getMyOrgs().subscribe((orgs) => {
          this.org = orgs.find((o) => o.personal) || orgs[0] || null;
        });
      },
      error: (err) => {
        console.error('Cancel error:', err);
        this.cancelling = false;
        this.showConfirm = false;
      },
    });
  }
}
