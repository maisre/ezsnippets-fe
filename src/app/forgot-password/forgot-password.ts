import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-forgot-password',
  imports: [FormsModule, RouterLink],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.css',
})
export class ForgotPassword {
  private authService = inject(AuthService);

  email = '';
  isLoading = false;
  submitted = false;
  errorMessage = '';

  onSubmit() {
    if (!this.email) return;

    this.isLoading = true;
    this.errorMessage = '';

    this.authService.forgotPassword(this.email).subscribe({
      next: () => {
        this.isLoading = false;
        this.submitted = true;
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = 'Something went wrong. Please try again.';
        console.error('Forgot password error:', error);
      },
    });
  }
}
