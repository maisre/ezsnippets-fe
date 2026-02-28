import { inject, Injectable } from '@angular/core';
import { environment } from './../environments/environment';
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

  login(username: string, password: string) {
    return this.http.post<{ access_token: string }>(`${environment.apiUrl}/auth/login`, {
      username,
      password,
    });
  }

  signup(username: string, password: string) {
    return this.http.post<{ access_token: string }>(`${environment.apiUrl}/auth/signup`, {
      username,
      password,
    });
  }

  logout(): void {
    this.removeToken();
    this.http.post(`${environment.apiUrl}/auth/logout`, {}).subscribe();
  }
}
