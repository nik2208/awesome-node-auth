// ============================================================
// Express integration — awesome-node-auth@1.10.10
// Auth mode: COOKIES
// ============================================================
// Install:
//   npm install awesome-node-auth express

import express from 'express';
import { AuthConfigurator, PasswordService } from 'awesome-node-auth';
import type { AuthConfig, IUserStore } from 'awesome-node-auth';
import { createAdminRouter } from 'awesome-node-auth';
import type { AdminOptions } from 'awesome-node-auth';

// ---- 1. Implement IUserStore (replace with your DB adapter) ----
// Use get_user_store_example to get a ready-made implementation for your DB.
// import { MyUserStore } from './user-store';

// ---- 2. Optional stores (use get_optional_stores for implementations) ----
// import { MyRbacStore }    from './rbac-store';
// const rbacStore    = new MyRbacStore();
// import { MySessionStore } from './session-store';
// const sessionStore = new MySessionStore();
// import { MyTenantStore }  from './tenant-store';
// const tenantStore  = new MyTenantStore();

// ---- 3. Auth configuration ----

const authConfig: AuthConfig = {
  accessTokenSecret:     process.env.ACCESS_TOKEN_SECRET  ?? 'change-me-access',
  refreshTokenSecret:    process.env.REFRESH_TOKEN_SECRET ?? 'change-me-refresh',
  accessTokenExpiresIn:  '15m',
  refreshTokenExpiresIn: '7d',
  cookieOptions: {
    secure:   process.env.NODE_ENV === 'production',
    // sameSite:'none' is required for cross-origin fetch with credentials:'include'.
    // In production this REQUIRES HTTPS (secure:true above).
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  },
  csrf: { enabled: true },
  email: {
    // Array of allowed front-end origins.  The router picks the one matching
    // the request Origin/Referer header for OAuth redirects; the first entry
    // is used for email links (magic link, password reset, etc.).
    siteUrl: process.env.CORS_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) ?? ['http://localhost:3000'],
    mailer: {
      endpoint: process.env.MAILER_ENDPOINT ?? '',
      apiKey:   process.env.MAILER_API_KEY   ?? '',
      from:     process.env.MAILER_FROM      ?? 'noreply@example.com',
    },
  },
  emailVerificationMode: 'strict',
  oauth: {
    google: {
      clientId:     process.env.GOOGLE_CLIENT_ID     ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      callbackUrl:  process.env.GOOGLE_CALLBACK_URL  ?? 'http://localhost:3000/auth/oauth/google/callback',
    },
    github: {
      clientId:     process.env.GITHUB_CLIENT_ID     ?? '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
      callbackUrl:  process.env.GITHUB_CALLBACK_URL  ?? 'http://localhost:3000/auth/oauth/github/callback',
    },
  },
};

// ---- 4. Wire up ----

const userStore: IUserStore = new MyUserStore(); // swap with your store
const auth = new AuthConfigurator(authConfig, userStore);
const app  = express();
app.use(express.json());

// Auth routes (POST /auth/login, POST /auth/register, POST /auth/refresh, …)
app.use('/auth', auth.router({
  onRegister: async (data, cfg) => {
    const hash = await new PasswordService().hash(data.password as string);
    return userStore.create({ email: data.email as string, password: hash, role: 'user' });
  },
  // rbacStore,
  // sessionStore,
  // tenantStore,
  // Dynamic CORS: the router adds Access-Control-* headers automatically
  // for every origin listed in CORS_ORIGINS.  On OAuth flows it also embeds
  // the caller's origin in the state parameter and redirects back to it after
  // a successful login (validated against the same allowlist).
  cors: {
    origins: process.env.CORS_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) ?? [],
  },
}));

// Mount admin UI at /admin  (protect with a strong secret in production)
const adminOptions: AdminOptions = {
  adminSecret: process.env.ADMIN_SECRET ?? 'change-me-admin-secret',
  // rbacStore,
  // sessionStore,
  // tenantStore,
};
app.use('/admin', createAdminRouter(userStore, adminOptions));

// ---- 5. Protect your own routes ----

app.get('/profile', auth.middleware(), (req, res) => {
  res.json({ user: (req as any).user });
});

app.listen(3000, () => console.log('Listening on http://localhost:3000'));
