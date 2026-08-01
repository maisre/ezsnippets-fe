import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterOutlet, RouterLink, Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { filter, map, startWith } from 'rxjs';
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
  private route = inject(ActivatedRoute);

  isAuthenticated$ = this.authService.isAuthenticated$;

  readonly currentYear = new Date().getFullYear();

  /**
   * Footer visibility is a per-route decision, not an auth one — the legal
   * links have to stay reachable from every public page and from /account,
   * which is our Paddle default payment link. Routes opt out with
   * `data: { hideFooter: true }`.
   */
  showFooter = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => !this.deepestRouteData()['hideFooter']),
    ),
    { initialValue: true },
  );

  /** Pre-launch gate — hides public Sign Up CTAs. See runtime-config. */
  get comingSoon(): boolean {
    return runtimeConfig.comingSoon;
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/']);
  }

  private deepestRouteData(): Record<string, unknown> {
    let route = this.route.snapshot;
    while (route.firstChild) {
      route = route.firstChild;
    }
    return route.data;
  }
}
