import { Component, inject } from '@angular/core';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login',
  imports: [],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private authService = inject(AuthService);

  public login() {
    this.authService.login();
  }

  public logout() {
    this.authService.logout();
  }

  public test() {
    this.authService.test();
  }
}
