import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth';
import { session } from './session';

/** Agrega el token a las peticiones de la zona privada y cierra la sesión si la API dice que ya no sirve. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const api = environment.apiUrl;
  const isPrivate =
    req.url.startsWith(api) && !req.url.startsWith(`${api}/public/`) && !/\/auth\/(login|register)$/.test(req.url);

  const token = session.get();
  const request = isPrivate && token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(
    catchError((err: unknown) => {
      if (isPrivate && token && err instanceof HttpErrorResponse && err.status === 401) auth.logout();
      return throwError(() => err);
    }),
  );
};
