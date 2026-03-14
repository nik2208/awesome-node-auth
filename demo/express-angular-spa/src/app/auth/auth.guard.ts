/**
 * Auth guards:
 *   authGuard      — require login; redirect to /login if not authenticated
 *   guestGuard     — redirect logged-in users away from /login and /register
 *   roleGuard(role) — require a specific role; redirect to /login or /403
 *   authCanMatch   — canMatch variant for lazy-loaded feature modules
 */

import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router, UrlTree } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { AuthService } from './auth.service';

// ── authGuard — requires authenticated user ───────────────────────────────────

export const authGuard: CanActivateFn = (_route, state) => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  return auth.user$.pipe(
    take(1),
    map(user =>
      user ? true : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } }),
    ),
  );
};

// ── authCanMatch — canMatch variant ──────────────────────────────────────────

export const authCanMatch: CanMatchFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  return auth.user$.pipe(
    take(1),
    map((user): boolean | UrlTree => user ? true : router.createUrlTree(['/login'])),
  );
};

// ── guestGuard — redirect authenticated users away from login/register ───────

export const guestGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  return auth.user$.pipe(
    take(1),
    map(user => user ? router.createUrlTree(['/dashboard']) : true),
  );
};

// ── roleGuard — require a specific role ──────────────────────────────────────

export function roleGuard(requiredRole: string): CanActivateFn {
  return () => {
    const auth   = inject(AuthService);
    const router = inject(Router);

    return auth.user$.pipe(
      take(1),
      map((user): boolean | UrlTree => {
        if (!user)                      return router.createUrlTree(['/login']);
        if (user.role !== requiredRole) return router.createUrlTree(['/login']);
        return true;
      }),
    );
  };
}
