import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NgIf } from '@angular/common';
import { AuthService } from '../../auth/auth.service';

@Component({
  standalone: true,
  selector: 'app-register',
  imports: [ReactiveFormsModule, NgIf],
  styles: [`
    :host { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #0f1c2e; border: 1px solid #1a2e42; border-radius: 12px; padding: 32px; width: 100%; max-width: 380px; }
    h1 { font-size: 22px; font-weight: 800; color: #00c896; margin-bottom: 4px; }
    .subtitle { font-size: 13px; color: #4a6a7a; margin-bottom: 24px; }
    label { font-size: 11px; font-weight: 700; color: #4a6a7a; text-transform: uppercase; letter-spacing: 0.6px; display: block; margin-bottom: 4px; margin-top: 14px; }
    input { width: 100%; background: #0e1928; border: 1px solid rgba(0,200,150,.15); border-radius: 8px; color: #d0e8e0; font-size: 14px; padding: 9px 12px; outline: none; }
    .btn { margin-top: 18px; background: linear-gradient(135deg,#00a87a,#007a58); color: #fff; border: none; border-radius: 8px; padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer; width: 100%; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .error { margin-top: 10px; font-size: 13px; color: #ff8a8a; }
    .hint { margin-top: 14px; font-size: 13px; color: #4a6a7a; text-align: center; }
    .hint a { color: #00a87a; text-decoration: none; }
  `],
  template: `
    <div class="card">
      <h1>awesome-node-auth</h1>
      <p class="subtitle">Angular SSR — Create account</p>

      <form [formGroup]="form" (ngSubmit)="submit()">
        <label>Email</label>
        <input formControlName="email" type="email" placeholder="you@example.com" />

        <label>Password</label>
        <input formControlName="password" type="password" placeholder="min 6 chars" />

        <p class="error" *ngIf="error">{{ error }}</p>

        <button class="btn" type="submit" [disabled]="form.invalid || loading">
          {{ loading ? 'Creating account…' : 'Create account' }}
        </button>
      </form>

      <p class="hint">Already have an account? <a [routerLink]="'/login'">Sign in →</a></p>
    </div>
  `,
})
export default class RegisterComponent {
  private auth   = inject(AuthService);
  private router = inject(Router);
  private fb     = inject(FormBuilder);

  form = this.fb.group({
    email:    ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  loading = false;
  error   = '';

  submit() {
    if (this.form.invalid) return;
    this.loading = true;
    this.error   = '';
    const { email, password } = this.form.value;
    this.auth.register(email!, password!).subscribe({
      next: () => this.router.navigateByUrl('/login'),
      error: (e: any) => {
        this.error   = e.error?.message ?? 'Registration failed';
        this.loading = false;
      },
    });
  }
}
