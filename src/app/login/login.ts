import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

interface LoginCredentials {
  email: string;
  password: string;
}

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  // Set by the invite page, so accepting picks up where signing in left off.
  private returnUrl = this.authService.safeReturnUrl(
    this.route.snapshot.queryParamMap.get('returnUrl'),
  );

  credentials: LoginCredentials = {
    email: this.route.snapshot.queryParamMap.get('email') ?? '',
    password: '',
  };

  isLoading = false;
  errorMessage = '';

  onSubmit() {
    if (this.credentials.email && this.credentials.password) {
      this.isLoading = true;
      this.errorMessage = '';

      this.authService.login(this.credentials.email, this.credentials.password).subscribe({
        next: (response) => {
          this.isLoading = false;
          this.authService.setToken(response.access_token);
          if (this.returnUrl) {
            this.router.navigateByUrl(this.returnUrl);
          } else {
            this.router.navigate(['/dashboard']);
          }
        },
        error: (error) => {
          this.isLoading = false;
          this.errorMessage = 'Login failed. Please check your credentials.';
          console.error('Login error:', error);
        },
      });
    }
  }
}
