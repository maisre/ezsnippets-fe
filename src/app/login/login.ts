import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

interface LoginCredentials {
  username: string;
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

  credentials: LoginCredentials = {
    username: '',
    password: '',
  };

  isLoading = false;
  errorMessage = '';

  onSubmit() {
    if (this.credentials.username && this.credentials.password) {
      this.isLoading = true;
      this.errorMessage = '';

      this.authService.login(this.credentials.username, this.credentials.password).subscribe({
        next: (response) => {
          this.isLoading = false;
          this.authService.setToken(response.access_token);
          this.router.navigate(['/pages']);
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
