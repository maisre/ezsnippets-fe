import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, Router } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { AuthService } from './auth.service';
import { runtimeConfig } from './runtime-config';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, AsyncPipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private authService = inject(AuthService);
  private router = inject(Router);

  isAuthenticated$ = this.authService.isAuthenticated$;

  /** Pre-launch gate — hides public Sign Up CTAs. See runtime-config. */
  get comingSoon(): boolean {
    return runtimeConfig.comingSoon;
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/']);
  }
}
