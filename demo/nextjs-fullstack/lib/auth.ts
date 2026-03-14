/**
 * Singleton auth configurator shared across all API routes.
 *
 * Swap InMemoryUserStore for a real IUserStore implementation when
 * connecting to a database.
 */

import { AuthConfigurator, AuthConfig, PasswordService, AuthError, createAdminRouter } from 'awesome-node-auth';
import { InMemoryUserStore } from './user-store';

export const authConfig: AuthConfig = {
  accessTokenSecret:  process.env.ACCESS_TOKEN_SECRET  ?? 'demo-access-secret-change-in-production',
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET ?? 'demo-refresh-secret-change-in-production',
  accessTokenExpiresIn:  '15m',
  refreshTokenExpiresIn: '7d',
  cookieOptions: {
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
};

export const userStore = new InMemoryUserStore();
const passwordService = new PasswordService();

// Singleton — avoids re-creating on every hot-reload in development
let _auth: AuthConfigurator | undefined;

export function getAuth(): AuthConfigurator {
  if (!_auth) {
    _auth = new AuthConfigurator(authConfig, userStore);
  }
  return _auth;
}

// Admin router singleton
let _adminRouter: ReturnType<typeof createAdminRouter> | undefined;

export function getAdminRouter() {
  if (!_adminRouter) {
    _adminRouter = createAdminRouter(userStore, {
      adminSecret: process.env.ADMIN_SECRET ?? '1234',
    });
  }
  return _adminRouter;
}

// Registration handler — called by POST /api/auth/register
export async function registerUser(data: { email?: string; password?: string }) {
  const email    = typeof data.email    === 'string' ? data.email.trim()    : '';
  const password = typeof data.password === 'string' ? data.password.trim() : '';
  if (!email || !password) throw new AuthError('email and password are required', 'VALIDATION_ERROR', 400);
  const existing = await userStore.findByEmail(email);
  if (existing) throw new AuthError('Email already registered', 'EMAIL_EXISTS', 409);
  const hash = await passwordService.hash(password);
  return userStore.create({ email, password: hash, role: 'user' });
}
