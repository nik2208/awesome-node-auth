/**
 * HTTP Interceptor — CSRF header + automatic token refresh queue.
 *
 * - Reads the csrf-token cookie (readable by JS, set by awesome-node-auth) and adds
 *   X-CSRF-Token header to every state-changing request.
 * - On 401, starts a token refresh. Concurrent 401s queue behind the first
 *   refresh instead of each triggering their own, avoiding race conditions.
 */

import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpErrorResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { BehaviorSubject, throwError, Observable } from 'rxjs';
import { catchError, switchMap, filter, take } from 'rxjs/operators';
import { AuthService } from './auth.service';

// Module-level queue state
let isRefreshing    = false;
const refreshDone$  = new BehaviorSubject<boolean>(false);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const modified = addCsrfHeader(req);

  return next(modified).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || req.url.includes('/auth/refresh')) {
        return throwError(() => err);
      }
      // SESSION_REVOKED is a permanent failure — the server has killed the
      // session, so attempting a refresh would only waste a round-trip and
      // could cause a loop.  Force an immediate local logout instead.
      if ((err.error as { code?: string } | null)?.code === 'SESSION_REVOKED') {
        auth.logout().subscribe();
        return throwError(() => err);
      }
      return handle401(modified, next, auth);
    }),
  );
};

// ── CSRF double-submit cookie ─────────────────────────────────────────────────

function addCsrfHeader(req: HttpRequest<unknown>): HttpRequest<unknown> {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return req;
  const token = getCsrfCookie();
  if (!token) return req;
  return req.clone({ setHeaders: { 'X-CSRF-Token': token } });
}

function getCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  // Check all cookie-tossing-resistant names in order of specificity.
  // awesome-node-auth uses __Host- (most secure) or __Secure- prefix when
  // cookieOptions.secure is true, to prevent subdomain cookie tossing attacks.
  // Cookie names are static constants — no dynamic regex needed.
  const cookies = document.cookie;
  for (const name of ['__Host-csrf-token', '__Secure-csrf-token', 'csrf-token'] as const) {
    // Split on ';' and find an exact key match to avoid partial-name collisions.
    const entry = cookies.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
    if (entry) return decodeURIComponent(entry.slice(name.length + 1));
  }
  return null;
}

// ── 401 handler with refresh queue ───────────────────────────────────────────

function handle401(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  auth: AuthService,
): Observable<unknown> {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshDone$.next(false);

    return auth.refresh().pipe(
      switchMap(() => {
        isRefreshing = false;
        refreshDone$.next(true);
        return next(addCsrfHeader(req));
      }),
      catchError(refreshErr => {
        isRefreshing = false;
        refreshDone$.next(false);
        auth.logout().subscribe();
        return throwError(() => refreshErr);
      }),
    );
  }

  return refreshDone$.pipe(
    filter(done => done === true),
    take(1),
    switchMap(() => next(addCsrfHeader(req))),
  );
}
