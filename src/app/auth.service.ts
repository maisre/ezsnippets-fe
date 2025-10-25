import { inject, Injectable } from '@angular/core';
import { environment } from './../environments/environment';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly TOKEN_KEY = 'auth_token';
  private http = inject(HttpClient);

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  setToken(token: string): void {
    localStorage.setItem(this.TOKEN_KEY, token);
  }

  removeToken(): void {
    localStorage.removeItem(this.TOKEN_KEY);
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

  logout(): void {
    this.http.post(`${environment.apiUrl}/auth/logout`, {}).subscribe((res) => {
      console.log(res);
    });
  }
}
