import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { readAttribution, trackGoal } from '../analytics';

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

  /**
   * "How did you hear about us?" — optional. It catches what links can't: people
   * who read a newsletter, then searched for us days later. Invitees skip it;
   * they're recorded as `invite`.
   */
  readonly heardAboutOptions = [
    { value: 'newsletter', label: 'A newsletter' },
    { value: 'reddit', label: 'Reddit' },
    { value: 'search', label: 'Google / search' },
    { value: 'social', label: 'X, LinkedIn or other social' },
    { value: 'youtube', label: 'YouTube' },
    { value: 'friend', label: 'A friend or colleague' },
    { value: 'other', label: 'Other' },
  ];
  readonly isInvite = !!this.returnUrl?.startsWith('/invite/');
  heardAbout = '';
  heardAboutDetail = '';

  get heardAboutDetailPrompt(): string | null {
    if (this.heardAbout === 'newsletter') return 'Which newsletter?';
    if (this.heardAbout === 'other') return 'Where?';
    return null;
  }

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

      const heardAbout = this.isInvite ? 'invite' : this.heardAbout;
      const acquisition = {
        ...readAttribution(),
        ...(heardAbout && { heardAbout }),
        ...(this.heardAboutDetailPrompt &&
          this.heardAboutDetail.trim() && { heardAboutDetail: this.heardAboutDetail.trim() }),
      };

      this.authService.signup(this.credentials.email, this.credentials.password, acquisition).subscribe({
        next: (response) => {
          this.isLoading = false;
          trackGoal('Signup', heardAbout ? { heard_about: heardAbout } : undefined);
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
