import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AsyncPipe, NgIf } from '@angular/common';
import { AuthService, AuthUser } from '../../auth/auth.service';

@Component({
  standalone: true,
  selector: 'app-dashboard',
  imports: [AsyncPipe, NgIf],
  styles: [`
    :host { display: block; min-height: 100vh; }
    header { background: #0f1c2e; border-bottom: 1px solid #1a2e42; padding: 14px 24px; display: flex; align-items: center; gap: 14px; }
    .logo { font-size: 18px; font-weight: 800; color: #00c896; }
    .badge { display: inline-flex; align-items: center; gap: 5px; background: rgba(0,200,150,.1); border: 1px solid rgba(0,200,150,.25); border-radius: 100px; padding: 2px 10px; font-size: 11px; font-weight: 700; color: #00c896; letter-spacing: 1px; text-transform: uppercase; }
    .pulse { width: 6px; height: 6px; background: #00c896; border-radius: 50%; }
    .user-info { margin-left: auto; font-size: 13px; color: #00c896; }
    .logout-btn { background: rgba(200,50,50,.15); border: 1px solid rgba(200,50,50,.3); color: #ff8a8a; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; }
    main { padding: 40px 24px; max-width: 700px; margin: 0 auto; }
    .card { background: #0f1c2e; border: 1px solid #1a2e42; border-radius: 12px; padding: 24px; margin-bottom: 20px; }
    h2 { font-size: 18px; font-weight: 700; color: #c8dce8; margin-bottom: 16px; }
    .user-card { background: rgba(0,200,150,.05); border: 1px solid rgba(0,200,150,.15); border-radius: 10px; padding: 14px; }
    .avatar { width: 42px; height: 42px; background: linear-gradient(135deg,#00a87a,#005a40); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; margin-bottom: 10px; }
    .email { font-size: 15px; font-weight: 600; color: #d0e8e0; }
    .meta { font-size: 12px; color: #4a6a7a; margin-top: 4px; }
    .role-badge { background: rgba(0,200,150,.1); border: 1px solid rgba(0,200,150,.2); color: #00c896; border-radius: 100px; padding: 1px 8px; font-size: 11px; font-weight: 600; }
    .info-box { background: rgba(0,200,150,.06); border: 1px solid rgba(0,200,150,.15); border-radius: 8px; padding: 12px 14px; font-size: 13px; color: #80b0a0; line-height: 1.6; margin-top: 14px; }
    code { background: rgba(0,200,150,.12); color: #00c896; padding: 1px 5px; border-radius: 4px; font-size: 12px; font-family: monospace; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
    .btn { background: linear-gradient(135deg,#00a87a,#007a58); color: #fff; border: none; border-radius: 8px; padding: 10px 18px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .btn-secondary { background: transparent; border: 1px solid rgba(255,255,255,.1); color: #7a8a9a; }
    pre { background: #060d17; border: 1px solid #1a2e42; border-radius: 8px; padding: 12px; font-size: 12px; color: #90c8b0; overflow: auto; margin-top: 14px; }
  `],
  template: `
    <header>
      <div class="logo">awesome-node-auth</div>
      <div class="badge"><span class="pulse"></span>authenticated</div>
      <div class="user-info" *ngIf="auth.user$ | async as user">{{ user.email }}</div>
      <button class="logout-btn" (click)="logout()">Logout</button>
    </header>

    <main>
      <div class="card" *ngIf="auth.user$ | async as user">
        <h2>Your Profile</h2>
        <div class="user-card">
          <div class="avatar">👤</div>
          <div class="email">{{ user.email }}</div>
          <div class="meta">id: {{ user.sub }} &nbsp; <span class="role-badge">{{ user.role ?? 'user' }}</span></div>
        </div>

        <div class="info-box">
          You are authenticated via an <code>accessToken</code> <strong>HttpOnly cookie</strong>.
          JavaScript cannot read the token value — the browser attaches it automatically to every request.
          The Angular <code>authInterceptor</code> adds the <code>X-CSRF-Token</code> header on state-changing calls.
        </div>

        <div class="actions">
          <button class="btn" (click)="fetchMe()">GET /auth/me</button>
          <button class="btn btn-secondary" (click)="doRefresh()">POST /auth/refresh</button>
        </div>

        <pre *ngIf="apiResult">{{ apiResult | json }}</pre>
      </div>
    </main>
  `,
})
export default class DashboardComponent implements OnInit {
  readonly auth   = inject(AuthService);
  private  router = inject(Router);

  apiResult: unknown = null;

  ngOnInit() {
    // Guard redirects unauthenticated users, but fetch profile anyway
    if (!this.auth.isLoggedIn) {
      this.auth.fetchCurrentUser().subscribe({
        error: () => this.router.navigateByUrl('/login'),
      });
    }
  }

  fetchMe() {
    this.auth.fetchCurrentUser().subscribe({
      next: user => { this.apiResult = user; },
      error: () => this.router.navigateByUrl('/login'),
    });
  }

  doRefresh() {
    this.auth.refresh().subscribe({
      next: user => { this.apiResult = { refreshed: true, user }; },
      error: () => this.router.navigateByUrl('/login'),
    });
  }

  logout() {
    this.auth.logout().subscribe(() => this.router.navigateByUrl('/login'));
  }
}
