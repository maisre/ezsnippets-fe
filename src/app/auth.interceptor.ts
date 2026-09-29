import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();

  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    tap({
      error: (err) => {
        if (err.status === 401) {
          authService.removeToken();
          // The team workspace this session was in has closed. Logging back
          // in lands them in their personal workspace; say why they're here.
          const closed = err.error?.code === 'WORKSPACE_CLOSED';
          router.navigate(['/login'], closed ? { queryParams: { closed: 1 } } : {});
        }
      },
    }),
  );
};
