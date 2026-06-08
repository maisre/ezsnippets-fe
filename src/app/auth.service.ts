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
