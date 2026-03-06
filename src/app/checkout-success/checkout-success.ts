import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-checkout-success',
  imports: [RouterLink],
  template: `
    <div class="success-page">
      <div class="success-card">
        <div class="success-icon">&#10003;</div>
        <h1>You're all set!</h1>
        <p>Your subscription is now active. Thanks for choosing EZ Snippet.</p>
        <a routerLink="/pages" class="btn btn-primary">Go to Dashboard</a>
      </div>
    </div>
  `,
  styles: `
    .success-page {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 60vh;
      padding: 2rem;
    }
    .success-card {
      text-align: center;
      max-width: 480px;
      padding: 3rem 2rem;
      border: 1px solid #e0e0e0;
      border-radius: 12px;
      background: white;
    }
    .success-icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background-color: #27ae60;
      color: white;
      font-size: 2rem;
      line-height: 64px;
      margin: 0 auto 1.5rem;
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
export class CheckoutSuccess {}
