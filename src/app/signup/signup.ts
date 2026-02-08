import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';

interface SignupCredentials {
  username: string;
  password: string;
  confirmPassword: string;
}

@Component({
  selector: 'app-signup',
  imports: [FormsModule],
  templateUrl: './signup.html',
  styleUrl: './signup.css',
})
export class Signup {
  private authService = inject(AuthService);
  private router = inject(Router);

  credentials: SignupCredentials = {
    username: '',
    password: '',
    confirmPassword: '',
  };

  isLoading = false;
  errorMessage = '';

  get passwordsMatch(): boolean {
    return this.credentials.password === this.credentials.confirmPassword;
  }

  onSubmit() {
    if (!this.passwordsMatch) {
      this.errorMessage = 'Passwords do not match.';
      return;
    }

    if (this.credentials.username && this.credentials.password) {
      this.isLoading = true;
      this.errorMessage = '';

      this.authService.signup(this.credentials.username, this.credentials.password).subscribe({
        next: (response) => {
          this.isLoading = false;
          this.authService.setToken(response.access_token);
          this.router.navigate(['/pages']);
        },
        error: (error) => {
          this.isLoading = false;
          this.errorMessage = error.error?.message || 'Signup failed. Please try again.';
          console.error('Signup error:', error);
        },
      });
    }
  }
}
