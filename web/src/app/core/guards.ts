import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth';

/** Solo entra quien tiene una sesión válida. */
export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(AuthService)
    .restore()
    .pipe(map((ok) => ok || router.createUrlTree(['/ingresar'])));
};

/** Ingresar y registrarse son para quien aún no tiene sesión. */
export const guestGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(AuthService)
    .restore()
    .pipe(map((ok) => (ok ? router.createUrlTree(['/app']) : true)));
};
