import { inject, Injectable } from '@angular/core';
import { runtimeConfig } from './runtime-config';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly TOKEN_KEY = 'auth_token';
  private http = inject(HttpClient);

  private _isAuthenticated$ = new BehaviorSubject<boolean>(this.isAuthenticated());
  isAuthenticated$ = this._isAuthenticated$.asObservable();

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  setToken(token: string): void {
    localStorage.setItem(this.TOKEN_KEY, token);
    this._isAuthenticated$.next(true);
  }

  removeToken(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    this._isAuthenticated$.next(false);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  // Reads `sub` out of the JWT payload without verifying it. Only ever used to
  // decide what to show — every actual permission is enforced server-side, so
  // a tampered token buys nothing but a misleading button.
  getUserId(): string | null {
    const token = this.getToken();
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload?.sub ?? null;
    } catch {
      return null;
    }
  }

  // withCredentials so the browser stores the ez_session cookie ez-api sets
  // (used by the cross-subdomain ez-view editor). The SPA still uses the
  // localStorage Bearer token for its own API calls.
  login(email: string, password: string) {
    return this.http.post<{ access_token: string }>(
      `${runtimeConfig.apiUrl}/auth/login`,
      { email, password },
      { withCredentials: true },
    );
  }

  signup(email: string, password: string) {
    return this.http.post<{ access_token: string }>(
      `${runtimeConfig.apiUrl}/auth/signup`,
      { email, password },
      { withCredentials: true },
    );
  }

  // Slides the cross-domain ez_session cookie forward (re-minted from the
  // Bearer token the interceptor attaches). Called right before opening the
  // ez-view editor so its cookie is fresh on arrival, even if the prior one
  // had lapsed. withCredentials so the browser stores the new Set-Cookie.
  refreshSessionCookie() {
    return this.http.post(
      `${runtimeConfig.apiUrl}/auth/session-cookie`,
      {},
      { withCredentials: true },
    );
  }

  /**
   * Scope the session to another workspace. Returns the new token; callers
   * hand it to enterWorkspace().
   */
  switchOrg(orgId: string) {
    return this.http.post<{ access_token: string }>(
      `${runtimeConfig.apiUrl}/auth/switch-org`,
      { orgId },
      { withCredentials: true },
    );
  }

  /**
   * Adopt a token for a different workspace and reload into it.
   *
   * A full reload rather than a router navigation: pages, layouts, favorites,
   * usage and the editor cookie are all scoped to the active org, and several
   * components cache them for their lifetime. Starting clean is the only way
   * to be sure nothing from the previous workspace is still on screen.
   */
  enterWorkspace(token: string, path = '/dashboard'): void {
    this.setToken(token);
    window.location.assign(path);
  }

  /**
   * A post-login destination from a query param — only same-app paths, so a
   * crafted link can't bounce someone off-site after they sign in.
   */
  safeReturnUrl(value: string | null | undefined): string | null {
    if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
    return value;
  }

  forgotPassword(email: string) {
    return this.http.post(`${runtimeConfig.apiUrl}/auth/forgot-password`, { email });
  }

  resetPassword(token: string, password: string) {
    return this.http.post(`${runtimeConfig.apiUrl}/auth/reset-password`, {
      token,
      password,
    });
  }

  logout(): void {
    this.removeToken();
    this.http
      .post(`${runtimeConfig.apiUrl}/auth/logout`, {}, { withCredentials: true })
      .subscribe();
  }
}
