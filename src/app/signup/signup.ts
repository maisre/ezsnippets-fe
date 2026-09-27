import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

interface SignupCredentials {
  email: string;
  password: string;
  confirmPassword: string;
}

@Component({
  selector: 'app-signup',
  imports: [FormsModule, RouterLink],
  templateUrl: './signup.html',
  styleUrl: './signup.css',
})
export class Signup {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  // Set by the invite page, so accepting picks up where signing in left off.
  private returnUrl = this.authService.safeReturnUrl(
    this.route.snapshot.queryParamMap.get('returnUrl'),
  );

  credentials: SignupCredentials = {
    email: this.route.snapshot.queryParamMap.get('email') ?? '',
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

    if (this.credentials.email && this.credentials.password) {
      this.isLoading = true;
      this.errorMessage = '';

      this.authService.signup(this.credentials.email, this.credentials.password).subscribe({
        next: (response) => {
          this.isLoading = false;
          this.authService.setToken(response.access_token);
          if (this.returnUrl) {
            this.router.navigateByUrl(this.returnUrl);
          } else {
            this.router.navigate(['/pages']);
          }
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
