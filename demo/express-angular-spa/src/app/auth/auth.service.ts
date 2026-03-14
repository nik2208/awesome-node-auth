import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { tap, catchError, map, switchMap } from 'rxjs/operators';

export interface AuthUser {
  sub: string;
  email: string;
  role?: string;
  [key: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private _user$ = new BehaviorSubject<AuthUser | null>(null);

  readonly user$ = this._user$.asObservable();

  get currentUser(): AuthUser | null { return this._user$.value; }
  get isLoggedIn(): boolean          { return this._user$.value !== null; }

  // ── Register ───────────────────────────────────────────────────────────────

  register(email: string, password: string): Observable<unknown> {
    return this.http.post('/auth/register', { email, password }, { withCredentials: true });
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  // awesome-node-auth sets accessToken + refreshToken + csrf-token cookies on success.

  login(email: string, password: string): Observable<AuthUser> {
    return this.http
      .post<void>('/auth/login', { email, password }, { withCredentials: true })
      .pipe(switchMap(() => this.fetchCurrentUser()));
  }

  // ── Logout ─────────────────────────────────────────────────────────────────

  logout(): Observable<void> {
    return this.http
      .post<void>('/auth/logout', {}, { withCredentials: true })
      .pipe(
        tap(() => this._user$.next(null)),
        catchError(() => { this._user$.next(null); return of(void 0); }),
      );
  }

  // ── Token refresh ──────────────────────────────────────────────────────────

  refresh(): Observable<AuthUser> {
    return this.http
      .post<void>('/auth/refresh', {}, { withCredentials: true })
      .pipe(switchMap(() => this.fetchCurrentUser()));
  }

  // ── Silent restore (APP_INITIALIZER) ──────────────────────────────────────

  tryRestoreSession(): Observable<boolean> {
    return this.refresh().pipe(
      map(() => true),
      catchError(() => of(false)),
    );
  }

  // ── Fetch user profile ─────────────────────────────────────────────────────

  fetchCurrentUser(): Observable<AuthUser> {
    return this.http
      .get<AuthUser>('/auth/me', { withCredentials: true })
      .pipe(tap(user => this._user$.next(user)));
  }
}
