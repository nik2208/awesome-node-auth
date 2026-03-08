# awesome-node-auth

![npm version](https://img.shields.io/npm/v/awesome-node-auth)
![license](https://img.shields.io/github/license/nik2208/awesome-node-auth)
![github stars](https://img.shields.io/github/stars/nik2208/awesome-node-auth)
[![](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=%23fe8e86)](https://github.com/sponsors/nik2208)
![](https://pixel.applikat.it/pixel.gif?site=awesomenodeauth.com)

[![NPM](https://nodei.co/npm/awesome-node-auth.png?downloads=true&downloadRank=true)](https://nodei.co/npm/awesome-node-auth/)


A production-ready, **database-agnostic** JWT authentication and communication bus for Node.js written in TypeScript. It establishes a 360-degree communication and access control layer compatible with any Node.js framework (NestJS, Next.js, Express, Fastify, etc.) and any database through a simple interface pattern.

**awesome-node-auth** is the simple answer to the management complexity and enterprise subscriptions often required for best-practice authentication. Solutions like *Supertokens* are extremely complex, paid if managed, and limited or hard to maintain if self-hosted. *Supabase* is heavy, packed with features you're forced to carry along even if you don't need them, and similarly limited when self-hosted. **awesome-node-auth** gives you the same enterprise-grade features without the architectural bloat or vendor lock-in of cloud platforms.

## Features

- 🔐 **JWT Authentication** – Access & refresh token pair with HttpOnly cookies or bearer tokens
- 🏠 **Local Strategy** – Email/password auth with bcrypt hashing and password reset
- 🔄 **OAuth 2.0** – Google, GitHub, or any custom provider via `GenericOAuthStrategy`
- 🪄 **Magic Links** – Passwordless email login; first magic-link counts as email verification
- 📱 **SMS OTP** – Phone number verification via one-time codes
- 🔑 **TOTP 2FA** – Time-based OTP compatible with Google Authenticator and Authy
- 🔒 **Flexible 2FA** – `require2FA` works with any channel (TOTP, SMS, magic-link), including OAuth
- 🔗 **Account Linking** – Link multiple OAuth providers; conflict resolution via `IPendingLinkStore`
- 🗃️ **Database Agnostic** – Implement one interface (`IUserStore`) for any database
- 🧩 **Strategy Pattern** – Plug in only the auth methods your app needs
- 🛡️ **Middleware** – JWT verification middleware (cookie or `Authorization: Bearer`)
- 🚀 **Express Router** – Drop-in `/auth` router with all endpoints pre-wired
- 📝 **Register Endpoint** – Optional `POST /auth/register` via `onRegister` callback
- 👤 **Rich `/me` Profile** – Returns profile, metadata, roles, and permissions
- 🧹 **Session Cleanup** – Optional `POST /auth/sessions/cleanup` for cron-based expiry
- 🔒 **CSRF Protection** – Double-submit cookie pattern, opt-in via `csrf.enabled`
- 🏷️ **Custom JWT Claims** – Inject project-specific data via `buildTokenPayload`
- 📋 **User Metadata** – Arbitrary per-user key/value store via `IUserMetadataStore`
- 🛡️ **Roles & Permissions** – RBAC with tenant awareness via `IRolesPermissionsStore`
- 📅 **Session Management** – Device-aware session listing & revocation via `ISessionStore`
- 🏢 **Multi-Tenancy** – Isolated multi-tenant apps via `ITenantStore`
- 🗑️ **Account Deletion** – `DELETE /auth/account` self-service removal with full cleanup
- 📧 **Email Verification** – `none` / `lazy` (configurable grace period) / `strict` modes
- 📡 **Event-Driven Tools** – `AuthEventBus`, telemetry, SSE, outgoing/inbound webhooks
- 🔑 **API Keys** – M2M bcrypt-hashed keys with scopes, expiry, IP allowlist, audit log
- 📖 **OpenAPI / Swagger UI** – Auto-generated specs for auth, admin, and tools routers

## Installation

```bash
npm install awesome-node-auth
```

## Quick Start

```typescript
import express from 'express';
import { AuthConfigurator } from 'awesome-node-auth';
import { myUserStore } from './my-user-store'; // Your IUserStore implementation

const app = express();
app.use(express.json());

const auth = new AuthConfigurator(
  {
    accessTokenSecret: process.env.ACCESS_TOKEN_SECRET!,
    refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET!,
    accessTokenExpiresIn: '15m',
    refreshTokenExpiresIn: '7d',
  },
  myUserStore
);

// Mount the auth router at /auth
app.use('/auth', auth.router());

// Protect routes
app.get('/protected', auth.middleware(), (req, res) => {
  res.json({ user: req.user });
});

app.listen(3000);
```

## Database Integration — Implementing IUserStore

The library is **completely database-agnostic**. The only coupling point to your database is the
`IUserStore` interface. Implement it once for your DB and pass the instance to `AuthConfigurator`.

### Interface contract

```typescript
import { IUserStore, BaseUser } from 'awesome-node-auth';

export class MyUserStore implements IUserStore {
  // ---- Required: core CRUD ---------------------------------------------------

  /** Find a user by email address (used for login, magic link, password reset). */
  async findByEmail(email: string): Promise<BaseUser | null> { /* ... */ }

  /** Find a user by primary key (used for token refresh, 2FA, SMS). */
  async findById(id: string): Promise<BaseUser | null> { /* ... */ }

  /** Create a new user (used by OAuth strategies when user doesn't exist yet). */
  async create(data: Partial<BaseUser>): Promise<BaseUser> { /* ... */ }

  // ---- Required: token field updates ----------------------------------------

  async updateRefreshToken(userId: string, token: string | null, expiry: Date | null): Promise<void> { /* ... */ }
  async updateResetToken(userId: string, token: string | null, expiry: Date | null): Promise<void> { /* ... */ }
  async updatePassword(userId: string, hashedPassword: string): Promise<void> { /* ... */ }
  async updateTotpSecret(userId: string, secret: string | null): Promise<void> { /* ... */ }
  async updateMagicLinkToken(userId: string, token: string | null, expiry: Date | null): Promise<void> { /* ... */ }
  async updateSmsCode(userId: string, code: string | null, expiry: Date | null): Promise<void> { /* ... */ }

  // ---- Optional: token look-ups (required for specific features) ------------

  /**
   * Required for: POST /auth/reset-password
   * Find a user whose `resetToken` field matches the given token.
   */
  async findByResetToken(token: string): Promise<BaseUser | null> { /* ... */ }

  /**
   * Required for: POST /auth/magic-link/verify
   * Find a user whose `magicLinkToken` field matches the given token.
   */
  async findByMagicLinkToken(token: string): Promise<BaseUser | null> { /* ... */ }

  /**
   * Optional but recommended for OAuth strategies.
   * Look up a user by the OAuth provider name and the provider's opaque user ID
   * (stored in `BaseUser.providerAccountId`).  Use this instead of (or in addition
   * to) `findByEmail` in `findOrCreateUser` to prevent account-takeover attacks.
   */
  async findByProviderAccount(provider: string, providerAccountId: string): Promise<BaseUser | null> { /* ... */ }
}
```

**In-memory store (testing/prototyping):**
```typescript
import { InMemoryUserStore } from './examples/in-memory-user-store';
const userStore = new InMemoryUserStore();
const auth = new AuthConfigurator(config, userStore);
```

**SQLite with `better-sqlite3`:**
```typescript
import Database from 'better-sqlite3';
import { SqliteUserStore } from './examples/sqlite-user-store.example';

const db = new Database('app.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const userStore = new SqliteUserStore(db); // creates the `users` table automatically
const auth = new AuthConfigurator(config, userStore);
```

**MySQL / MariaDB with `mysql2`:**
```typescript
import mysql from 'mysql2/promise';
import { MySqlUserStore } from './examples/mysql-user-store.example';

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const userStore = new MySqlUserStore(pool);
await userStore.init(); // creates the `users` table automatically
const auth = new AuthConfigurator(config, userStore);
```

**MongoDB with the `mongodb` driver:**
```typescript
import { MongoClient } from 'mongodb';
import { MongoDbUserStore } from './examples/mongodb-user-store.example';

const client = new MongoClient(process.env.MONGODB_URI!);
await client.connect();

const userStore = new MongoDbUserStore(client.db('myapp'));
await userStore.init(); // creates indexes automatically
const auth = new AuthConfigurator(config, userStore);
```

**PostgreSQL (example skeleton):**
```typescript
import { Pool } from 'pg';
import { IUserStore, BaseUser } from 'awesome-node-auth';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export class PgUserStore implements IUserStore {
  async findByEmail(email: string) {
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    return rows[0] ?? null;
  }
  async findById(id: string) {
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [id]);
    return rows[0] ?? null;
  }
  // ... implement remaining methods
}
```


## Framework Integration

### NestJS

See `examples/nestjs-integration.example.ts` for a full working example that includes:

- **`AuthModule.forRoot()`** — NestJS DynamicModule wrapping `AuthConfigurator`
- **`JwtAuthGuard`** — NestJS `CanActivate` guard backed by `auth.middleware()`
- **`@CurrentUser()`** — parameter decorator that extracts `req.user`
- **`AuthController`** — catch-all controller that forwards `/auth/*` traffic to `auth.router()`

```typescript
// app.module.ts
import { AuthModule } from './auth.module';
import { MyUserStore } from './my-user-store';

@Module({
  imports: [
    AuthModule.forRoot({
      config:    authConfig,
      userStore: new MyUserStore(),
    }),
  ],
})
export class AppModule {}

// Protect a route
@Controller('profile')
export class ProfileController {
  @Get()
  @UseGuards(JwtAuthGuard)
  getProfile(@CurrentUser() user: BaseUser) {
    return user;
  }
}
```

### Next.js

See `examples/nextjs-integration.example.ts` for a full working example that covers both the **App Router** (Next.js 13+) and the legacy **Pages Router**.

**Pages Router (simplest approach):**

```typescript
// pages/api/auth/[...auth].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuth } from '../../lib/auth';

export const config = { api: { bodyParser: false } };

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const router = getAuth().router();
  req.url = req.url!.replace(/^\/api\/auth/, '') || '/';
  router(req as any, res as any, () => res.status(404).end());
}
```

**Protecting a Server Component (App Router):**

```typescript
// app/dashboard/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { TokenService } from 'awesome-node-auth';
import { authConfig } from '../../lib/auth';

export default async function DashboardPage() {
  const token = cookies().get('access_token')?.value;
  if (!token) redirect('/login');

  const payload = new TokenService().verifyAccessToken(token, authConfig);
  if (!payload) redirect('/login');

  return <div>Welcome, {payload.email}!</div>;
}
```

## Auth Router Endpoints

When you mount `auth.router()`, the following endpoints are available:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/register` | Register a new user _(optional — requires `onRegister` in `RouterOptions`)_ |
| `POST` | `/auth/login` | Login with email/password |
| `POST` | `/auth/logout` | Logout and clear cookies |
| `POST` | `/auth/refresh` | Refresh access token |
| `GET` | `/auth/me` | Get current user's rich profile (protected) |
| `POST` | `/auth/forgot-password` | Send password reset email |
| `POST` | `/auth/reset-password` | Reset password with token |
| `POST` | `/auth/change-password` | Change password (authenticated, requires `currentPassword` + `newPassword`) |
| `POST` | `/auth/send-verification-email` | Send email verification link (authenticated) |
| `GET` | `/auth/verify-email?token=...` | Verify email address from link |
| `POST` | `/auth/change-email/request` | Request email change — sends verification to `newEmail` (authenticated) |
| `POST` | `/auth/change-email/confirm` | Confirm email change with token |
| `POST` | `/auth/2fa/setup` | Get TOTP secret + QR code (protected) |
| `POST` | `/auth/2fa/verify-setup` | Verify TOTP code and enable 2FA (protected) |
| `POST` | `/auth/2fa/verify` | Complete TOTP 2FA login |
| `POST` | `/auth/2fa/disable` | Disable 2FA (protected; blocked when `user.require2FA` or system `require2FA` policy is set) |
| `POST` | `/auth/magic-link/send` | Send magic link — direct login (`mode='login'`, default) or 2FA challenge (`mode='2fa'`, requires `tempToken`) |
| `POST` | `/auth/magic-link/verify` | Verify magic link — direct login (`mode='login'`, default, **marks email as verified on first use**) or 2FA completion (`mode='2fa'`, requires `tempToken`) |
| `POST` | `/auth/sms/send` | Send SMS code — direct login (`mode='login'`, default, accepts `userId` **or** `email`) or 2FA challenge (`mode='2fa'`, requires `tempToken`) |
| `POST` | `/auth/sms/verify` | Verify SMS code — direct login (`mode='login'`, default) or 2FA completion (`mode='2fa'`, requires `tempToken`) |
| `POST` | `/auth/sessions/cleanup` | Delete expired sessions _(optional — requires `sessionStore.deleteExpiredSessions`)_ |
| `DELETE` | `/auth/account` | Authenticated self-service account deletion — revokes all sessions, removes RBAC roles, tenant memberships, metadata, and deletes the user record |
| `GET` | `/auth/oauth/google` | Initiate Google OAuth |
| `GET` | `/auth/oauth/google/callback` | Google OAuth callback |
| `GET` | `/auth/oauth/github` | Initiate GitHub OAuth |
| `GET` | `/auth/oauth/github/callback` | GitHub OAuth callback |
| `GET` | `/auth/oauth/:name` | Initiate OAuth for any custom provider _(optional — requires `oauthStrategies`)_ |
| `GET` | `/auth/oauth/:name/callback` | Callback for custom provider _(optional — requires `oauthStrategies`)_ |
| `GET` | `/auth/linked-accounts` | List OAuth accounts linked to the current user (protected) _(optional — requires `linkedAccountsStore`)_ |
| `DELETE` | `/auth/linked-accounts/:provider/:providerAccountId` | Unlink a provider account (protected) _(optional — requires `linkedAccountsStore`)_ |
| `POST` | `/auth/link-request` | Initiate email-based account link — sends a verification email to target address (protected) _(optional — requires `linkedAccountsStore` + `IUserStore.updateAccountLinkToken`)_ |
| `POST` | `/auth/link-verify` | Complete account link — validates the token and records the new linked account; set `loginAfterLinking: true` in the body to receive a session immediately after linking _(optional — requires `linkedAccountsStore` + `IUserStore.findByAccountLinkToken`)_ |

## CORS & Multi-Frontend Support

When your frontend and backend run on different domains (e.g., `api.yourapp.com` and `app.yourapp.com`), or when you have multiple frontends connecting to the same backend, you must configure CORS properly.

The `awesome-node-auth` router can handle CORS headers automatically if you provide the `cors` option in `RouterOptions`. This is the recommended approach for auth routes because it automatically handles the `Vary: Origin` header and resolves the correct `siteUrl` dynamically for password resets and magic links.

```typescript
import { createAuthRouter } from 'awesome-node-auth';

app.use('/auth', createAuthRouter(userStore, config, {
  cors: {
    origins: ['https://app.yourapp.com', 'https://admin.yourapp.com'],
  }
}));
```

### Dynamic Email Links (`siteUrl`)
When the router receives a request from an allowed origin, it dynamically sets that origin as the base URL for any emails sent during that request (like magic links or password resets). This ensures users are redirected back to the exact frontend they initiated the request from.

The `config.email.siteUrl` acts as a fallback for requests that don't pass an `Origin` header (like server-to-server calls).

### Cross-Origin Cookies & CSRF
If your frontend and backend share the **same parent domain** (e.g., `ui.example.com` and `api.example.com`), browsers treat them as same-site. Set `cookieOptions.domain: '.example.com'` and `cookieOptions.sameSite: 'lax'`.

If they are on **completely different domains**:
1. You **must** use `cookieOptions.sameSite: 'none'` and `cookieOptions.secure: true`.
2. You **must** disable CSRF protection (`csrf.enabled: false`) since the double-submit pattern relies on reading cookies from JS, which is impossible across different domains due to `SameSite=None` rules.
3. You should rely on strict CORS origins to protect against CSRF attacks.

## Configuration

```typescript
import { AuthConfig } from 'awesome-node-auth';

const config: AuthConfig = {
  // Required
  accessTokenSecret: process.env.ACCESS_TOKEN_SECRET!,
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET!,

  // Token lifetimes (default: 15m / 7d)
  accessTokenExpiresIn: '15m',
  refreshTokenExpiresIn: '7d',

  // Cookie options
  cookieOptions: {
    secure: true,       // HTTPS only (recommended in production)
    sameSite: 'lax',
    domain: 'yourdomain.com',
    // Restrict the refresh-token cookie to the refresh endpoint for extra security:
    refreshTokenPath: '/auth/refresh',
  },

  // CSRF protection (double-submit cookie pattern) — see "CSRF Protection" section
  csrf: {
    enabled: true,    // default: false
  },

  // bcrypt salt rounds (default: 12)
  bcryptSaltRounds: 12,

  // Email — see "Mailer Configuration" section below
  email: {
    siteUrl: 'https://yourapp.com',
    mailer: {
      endpoint: process.env.MAILER_ENDPOINT!,   // HTTP POST endpoint
      apiKey:   process.env.MAILER_API_KEY!,
      from:     'noreply@yourapp.com',
      fromName: 'My App',
      provider: 'mailgun',                        // optional — forwarded to your mailer API
      defaultLang: 'en',                          // 'en' or 'it'
    },
  },

  // SMS (for OTP verification codes)
  sms: {
    endpoint:             'https://sms.example.com/sendsms',
    apiKey:               process.env.SMS_API_KEY!,
    username:             process.env.SMS_USERNAME!,
    password:             process.env.SMS_PASSWORD!,
    codeExpiresInMinutes: 10,
  },

  // OAuth
  oauth: {
    google: {
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackUrl:  'https://yourapp.com/auth/oauth/google/callback',
    },
    github: {
      clientId:     process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      callbackUrl:  'https://yourapp.com/auth/oauth/github/callback',
    },
  },

  // 2FA app name shown in authenticator apps
  twoFactor: {
    appName: 'My App',
  },
};
```

## Mailer Configuration

The library ships a built-in **HTTP mailer transport** (`MailerService`) that sends transactional
emails (password reset, magic links, welcome) via an HTTP POST to any configurable endpoint — no
SMTP required. Built-in templates are available in **English** (`en`) and **Italian** (`it`).

### Option A — Built-in HTTP mailer transport (recommended)

Configure `email.mailer` in `AuthConfig`. The library will automatically send emails using the
built-in templates whenever a reset link or magic link needs to go out.

```typescript
import { AuthConfig, MailerConfig } from 'awesome-node-auth';

const config: AuthConfig = {
  // ...jwt secrets, cookies...
  email: {
    siteUrl: 'https://yourapp.com',
    mailer: {
      /** Full URL of your mailer API endpoint. Receives a JSON POST. */
      endpoint:    process.env.MAILER_ENDPOINT!,   // e.g. 'https://api.mailgun.net/v3/...'
      /** API key sent as the X-API-Key request header. */
      apiKey:      process.env.MAILER_API_KEY!,
      /** Sender address. */
      from:        'noreply@yourapp.com',
      /** Sender display name (optional). */
      fromName:    'My App',
      /**
       * Email provider identifier forwarded to your mailer API (optional).
       * Useful when your proxy supports multiple providers (e.g. 'mailgun', 'sendgrid').
       */
      provider:    'mailgun',
      /**
       * Default language for built-in templates.
       * Supported: 'en' (default) | 'it'
       * Can be overridden per-request by passing emailLang in the request body.
       */
      defaultLang: 'en',
    },
  },
};
```

The mailer sends a **POST** request to `endpoint` with the following JSON body:

```json
{
  "to":       "user@example.com",
  "from":     "noreply@yourapp.com",
  "fromName": "My App",
  "provider": "mailgun",
  "subject":  "Reset your password",
  "html":     "<p>Click the link...</p>",
  "text":     "Click the link..."
}
```

and the header `X-API-Key: <apiKey>`.

> **Note:** `provider` and `fromName` are only included when set in `MailerConfig`; they are omitted from the payload when not configured.

Your mailer API (Mailgun, Resend, SendGrid, a custom proxy, etc.) only needs to accept this JSON
shape and forward it to the email provider. The content-type is `application/json`.

#### Per-request language override

For `POST /auth/forgot-password` and `POST /auth/magic-link/send`, pass `emailLang` in the request
body to override `defaultLang` for a single request:

```json
{ "email": "user@example.com", "emailLang": "it" }
```

#### Using `MailerService` directly

```typescript
import { MailerService } from 'awesome-node-auth';

const mailer = new MailerService({
  endpoint:    'https://mailer.example.com/send',
  apiKey:      'key-xxx',
  from:        'noreply@example.com',
  defaultLang: 'it',
});

await mailer.sendPasswordReset(to, token, resetLink, 'it');
await mailer.sendMagicLink(to, token, magicLink);
await mailer.sendWelcome(to, { loginUrl: 'https://yourapp.com/login', tempPassword: 'Temp@123' }, 'it');
```

### Option B — Custom callbacks

If you prefer full control, provide callback functions instead of (or in addition to) `mailer`.
**Callbacks always take precedence over the `mailer` transport.**

```typescript
email: {
  siteUrl: 'https://yourapp.com',
  sendPasswordReset: async (to, token, link, lang) => {
    await myEmailClient.send({ to, subject: 'Reset your password', html: `...${link}...` });
  },
  sendMagicLink: async (to, token, link, lang) => {
    await myEmailClient.send({ to, subject: 'Your sign-in link', html: `...${link}...` });
  },
  sendWelcome: async (to, data, lang) => {
    await myEmailClient.send({ to, subject: 'Welcome!', html: `...${data.loginUrl}...` });
  },
},
```


## OAuth Strategies

OAuth strategies are abstract—extend them to implement your own user lookup logic.

The profile object passed to `findOrCreateUser` now includes an `emailVerified` boolean (available from Google; derived from the primary-email entry for GitHub). Always store the provider's opaque user ID in `providerAccountId` and use `findByProviderAccount` for safe lookups — **do not** rely solely on email matching, which is vulnerable to account-takeover attacks.

```typescript
import { GoogleStrategy, BaseUser, AuthConfig, AuthError } from 'awesome-node-auth';

class MyGoogleStrategy extends GoogleStrategy<BaseUser> {
  constructor(config: AuthConfig, private userStore: MyUserStore) {
    super(config);
  }

  async findOrCreateUser(profile: {
    id: string;
    email: string;
    emailVerified?: boolean;
    name?: string;
    picture?: string;
  }) {
    // 1. Precise match — same provider + same provider ID (no email guessing)
    if (this.userStore.findByProviderAccount) {
      const existing = await this.userStore.findByProviderAccount('google', profile.id);
      if (existing) return existing;
    }

    // 2. Email collision with a different account → signal conflict so the
    //    OAuth callback can redirect to a "link accounts" page.
    const byEmail = await this.userStore.findByEmail(profile.email);
    if (byEmail) {
      throw new AuthError(
        'An account with this email already exists. Please log in with your original method to link accounts.',
        'OAUTH_ACCOUNT_CONFLICT',
        409,
      );
    }

    // 3. Brand-new user
    return this.userStore.create({
      email:             profile.email,
      loginProvider:     'google',
      providerAccountId: profile.id,
      isEmailVerified:   profile.emailVerified ?? false,
      firstName:         profile.name?.split(' ')[0],
      lastName:          profile.name?.split(' ').slice(1).join(' ') || null,
    });
  }
}

// Pass to router
app.use('/auth', auth.router({
  googleStrategy: new MyGoogleStrategy(config, userStore),
  githubStrategy: new MyGithubStrategy(config, userStore),
}));
```

When `findOrCreateUser` throws an `AuthError` with code `'OAUTH_ACCOUNT_CONFLICT'`, the built-in OAuth callback automatically redirects to:

```
{siteUrl}/auth/account-conflict?provider=google&code=OAUTH_ACCOUNT_CONFLICT&email=user%40example.com
```

When you also attach `{ email, providerAccountId }` to the thrown `AuthError`'s `data` field **and** provide a `pendingLinkStore` in `RouterOptions`, the library stashes the conflicting provider details automatically so the front-end can drive the full conflict-resolution flow without any custom server routes:

```typescript
// Inside findOrCreateUser — throw with data payload
throw new AuthError(
  'Email already registered with a different provider',
  'OAUTH_ACCOUNT_CONFLICT',
  409,
  { email: profile.email, providerAccountId: profile.id },
);
```

Handle the `/auth/account-conflict` route in your frontend to prompt the user to verify ownership of the existing account (e.g. enter password, magic link), then call `POST /auth/link-verify` with `loginAfterLinking: true` to complete linking and receive a new session.

> **Security note:** Never auto-link two accounts just because they share an email. Always require the user to prove ownership of the existing account first (e.g. by entering their password) before creating the link.

#### Native conflict linking with `IPendingLinkStore`

Provide an `IPendingLinkStore` to let the library manage stashing natively — no custom `/conflict-link-*` routes needed:

```typescript
import { IPendingLinkStore } from 'awesome-node-auth';

class RedisPendingLinkStore implements IPendingLinkStore {
  async stash(email: string, provider: string, providerAccountId: string): Promise<void> {
    await redis.set(`pending:${email}:${provider}`, providerAccountId, 'EX', 3600);
  }
  async retrieve(email: string, provider: string): Promise<{ providerAccountId: string } | null> {
    const id = await redis.get(`pending:${email}:${provider}`);
    return id ? { providerAccountId: id } : null;
  }
  async remove(email: string, provider: string): Promise<void> {
    await redis.del(`pending:${email}:${provider}`);
  }
}

app.use('/auth', createAuthRouter(userStore, config, {
  googleStrategy: new MyGoogleStrategy(config, userStore),
  linkedAccountsStore: new MyLinkedAccountsStore(),
  pendingLinkStore: new RedisPendingLinkStore(),
}));
```

**End-to-end unauthenticated conflict-linking flow:**

1. User tries to sign in with Google; `findOrCreateUser` detects the email already belongs to an existing account and throws `AuthError('...', 'OAUTH_ACCOUNT_CONFLICT', 409, { email, providerAccountId })`.
2. Library calls `pendingLinkStore.stash(email, 'google', providerAccountId)` and redirects the browser to `{siteUrl}/auth/account-conflict?provider=google&email=user%40example.com`.
3. Frontend prompts the user to verify ownership (e.g. sends a magic link / password check).  Once verified, the front-end has a `linkToken` from `POST /auth/link-request`.
4. Frontend calls `POST /auth/link-verify` with `{ token, loginAfterLinking: true }`. The library retrieves the stashed `providerAccountId`, links the account, clears the stash, and returns a full session.

```typescript
// Step 3 — authenticated (or unauthenticated) user initiates the link
// (the link-request email is sent to the email from the conflict redirect)
await fetch('/auth/link-request', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: emailFromConflictRedirect, provider: 'google' }),
});

// Step 4 — complete link and get a session in one call
const res = await fetch('/auth/link-verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: tokenFromEmail, loginAfterLinking: true }),
});
// → tokens are set as cookies (or returned in body with X-Auth-Strategy: bearer)
// → pendingLinkStore.retrieve() fetched the real providerAccountId automatically
```

### 2FA enforcement for OAuth logins

When a user who has 2FA enabled (or for whom `require2FA` is set) logs in via OAuth, the library
**does not issue full tokens immediately**. Instead, the callback redirects to:

```
{siteUrl}/auth/2fa?tempToken=<encoded-temp-token>&methods=totp,sms,magic-link
```

Your frontend should present the appropriate 2FA challenge here. The user then completes 2FA via the
existing `/auth/2fa/verify`, `/auth/sms/verify`, or `/auth/magic-link/verify?mode=2fa` endpoints as
normal.

### Adding a custom OAuth provider with `GenericOAuthStrategy`

Use `GenericOAuthStrategy` to integrate any OAuth 2.0 provider that follows the standard
Authorization Code flow with a JSON user-info endpoint — no need to write boilerplate:

```typescript
import { GenericOAuthStrategy, GenericOAuthProviderConfig, BaseUser } from 'awesome-node-auth';

const discordConfig: GenericOAuthProviderConfig = {
  name: 'discord',
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  callbackUrl: 'https://yourapp.com/auth/oauth/discord/callback',
  authorizationUrl: 'https://discord.com/api/oauth2/authorize',
  tokenUrl: 'https://discord.com/api/oauth2/token',
  userInfoUrl: 'https://discord.com/api/users/@me',
  scope: 'identify email',
  // Optional: map provider-specific field names to the standard profile shape
  mapProfile: (raw) => ({
    id: String(raw['id']),
    email: String(raw['email']),
    name: String(raw['username']),
  }),
};

class DiscordStrategy extends GenericOAuthStrategy<BaseUser> {
  constructor(private userStore: MyUserStore) {
    super(discordConfig);
  }

  async findOrCreateUser(profile: { id: string; email: string; name?: string }): Promise<BaseUser> {
    const existing = await this.userStore.findByProviderAccount?.('discord', profile.id);
    if (existing) return existing;
    return this.userStore.create({ email: profile.email, loginProvider: 'discord', providerAccountId: profile.id });
  }
}

// Pass via oauthStrategies — the router mounts:
//   GET /auth/oauth/discord           → redirect to Discord
//   GET /auth/oauth/discord/callback  → handle callback
app.use('/auth', createAuthRouter(userStore, config, {
  oauthStrategies: [new DiscordStrategy(userStore)],
}));
```

### Flexible account linking with `ILinkedAccountsStore`

When you provide a `linkedAccountsStore`, each OAuth login automatically records a link entry so
users can connect multiple providers to a single account. The following endpoints become available:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/auth/linked-accounts` | List all OAuth accounts linked to the authenticated user |
| `DELETE` | `/auth/linked-accounts/:provider/:providerAccountId` | Unlink a specific provider account |
| `POST` | `/auth/link-request` | Initiate explicit email-based link (authenticated) |
| `POST` | `/auth/link-verify` | Complete the link with the token from the email |

```typescript
import { ILinkedAccountsStore, LinkedAccount } from 'awesome-node-auth';

class MyLinkedAccountsStore implements ILinkedAccountsStore {
  async getLinkedAccounts(userId: string): Promise<LinkedAccount[]> {
    return db('linked_accounts').where({ userId });
  }
  async linkAccount(userId: string, account: LinkedAccount): Promise<void> {
    await db('linked_accounts').insert({ userId, ...account }).onConflict().ignore();
  }
  async unlinkAccount(userId: string, provider: string, providerAccountId: string): Promise<void> {
    await db('linked_accounts').where({ userId, provider, providerAccountId }).delete();
  }
  async findUserByProviderAccount(provider: string, providerAccountId: string): Promise<{ userId: string } | null> {
    const row = await db('linked_accounts').where({ provider, providerAccountId }).first();
    return row ? { userId: row.userId } : null;
  }
}

app.use('/auth', createAuthRouter(userStore, config, {
  googleStrategy: new MyGoogleStrategy(config, userStore),
  linkedAccountsStore: new MyLinkedAccountsStore(),
}));
```

#### Explicit email-based linking (`link-request` / `link-verify`)

To let an authenticated user attach a secondary email address (or any provider) without going through a full OAuth redirect:

```typescript
// Step 1 — authenticated user initiates the link
// POST /auth/link-request
// Authorization: Bearer <accessToken>
// Body: { email: "secondary@example.com", provider?: "email" }
await fetch('/auth/link-request', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'secondary@example.com', provider: 'email' }),
});
// → a 1-hour verification token is generated and sent to secondary@example.com

// Step 2 — user clicks the link in the email; token is passed back
// POST /auth/link-verify  (public, no auth required)
// Body: { token: "<token-from-email>", loginAfterLinking?: true }
await fetch('/auth/link-verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: tokenFromLink }),
});
// → linkedAccountsStore.linkAccount() is called; account appears in GET /auth/linked-accounts

// Optional: pass loginAfterLinking: true to receive a session immediately
await fetch('/auth/link-verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: tokenFromLink, loginAfterLinking: true }),
});
// → tokens set as cookies (or in body for X-Auth-Strategy: bearer); user is now logged in
```

**Required `IUserStore` methods** (add alongside your existing store):

```typescript
// Store a pending link token (called by link-request)
async updateAccountLinkToken(
  userId: string,
  pendingEmail: string | null,
  pendingProvider: string | null,
  token: string | null,
  expiry: Date | null,
): Promise<void>

// Look up user by their pending link token (called by link-verify)
async findByAccountLinkToken(token: string): Promise<User | null>
```

**Disabling 2FA** (`POST /auth/2fa/disable`) is blocked when:
- The user record has `require2FA: true`, **or**
- The system-wide `require2FA` setting is `true` (requires `settingsStore` in `RouterOptions`).

This lets users self-manage 2FA freely unless the administrator or the user's own profile mandates it.

## Using Services Directly

Access the underlying services for custom flows:

```typescript
const auth = new AuthConfigurator(config, userStore);

// Hash passwords
const hash = await auth.passwordService.hash('mypassword');
const valid = await auth.passwordService.compare('mypassword', hash);

// Generate/verify tokens
const tokens = auth.tokenService.generateTokenPair({ sub: userId, email }, config);
const payload = auth.tokenService.verifyAccessToken(token, config);

// Get a local strategy instance
const localStrategy = auth.strategy('local');
const user = await localStrategy.authenticate({ email, password }, config);
```

## Using Strategies Independently

```typescript
import {
  MagicLinkStrategy,
  SmsStrategy,
  TotpStrategy,
  LocalStrategy,
  PasswordService,
} from 'awesome-node-auth';

// Magic Links
const magicLink = new MagicLinkStrategy();
await magicLink.sendMagicLink(email, userStore, config);
const user = await magicLink.verify(token, userStore);

// SMS OTP
const sms = new SmsStrategy();
await sms.sendCode(phone, userId, userStore, config);
const valid = await sms.verify(userId, code, userStore);

// TOTP 2FA
const totpStrategy = new TotpStrategy();
const { secret, otpauthUrl, qrCode } = totpStrategy.generateSecret(email, 'MyApp');
const qrDataUrl = await qrCode; // data:image/png;base64,...
const isValid = await totpStrategy.verify(token, secret);
```

## BaseUser Model

```typescript
interface BaseUser {
  id: string;
  email: string;
  password?: string;
  role?: string;
  /** First name (optional — stored as a profile field). */
  firstName?: string | null;
  /** Last name / surname (optional — stored as a profile field). */
  lastName?: string | null;
  /**
   * Authentication provider used to create / link this account.
   * Defaults to `'local'` when not set.
   * Examples: `'local'` | `'google'` | `'github'` | `'magic-link'` | `'sms'`
   */
  loginProvider?: string | null;
  refreshToken?: string | null;
  refreshTokenExpiry?: Date | null;
  resetToken?: string | null;
  resetTokenExpiry?: Date | null;
  /**
   * TOTP secret stored after the user completes the 2FA setup flow
   * (`POST /auth/2fa/verify-setup`).  `null` means the user has not yet paired
   * an authenticator app.
   */
  totpSecret?: string | null;
  /**
   * `true` once the user has successfully called `POST /auth/2fa/verify-setup`.
   * Reset to `false` by `POST /auth/2fa/disable`.
   *
   * > **Note:** simply calling `POST /auth/2fa/setup` does **not** enable 2FA.
   * > The user must scan the QR code in their authenticator app and then call
   * > `POST /auth/2fa/verify-setup` with the 6-digit code to confirm pairing.
   */
  isTotpEnabled?: boolean;
  isEmailVerified?: boolean;
  magicLinkToken?: string | null;
  magicLinkTokenExpiry?: Date | null;
  smsCode?: string | null;
  smsCodeExpiry?: Date | null;
  phoneNumber?: string | null;
  require2FA?: boolean;
  // Email verification
  emailVerificationToken?: string | null;
  emailVerificationTokenExpiry?: Date | null;
  /**
   * Deadline for lazy email-verification mode.
   * After this date login is blocked until the email is confirmed.
   * Set at registration time (e.g. `createdAt + 7d`). Leave null for
   * a permanent grace period.
   */
  emailVerificationDeadline?: Date | null;
  // Change email
  pendingEmail?: string | null;
  emailChangeToken?: string | null;
  emailChangeTokenExpiry?: Date | null;
  // Account linking (email-based link-request / link-verify flow)
  accountLinkToken?: string | null;
  accountLinkTokenExpiry?: Date | null;
  accountLinkPendingEmail?: string | null;
  accountLinkPendingProvider?: string | null;
  /**
   * The unique user ID returned by the OAuth provider (e.g. Google `sub`,
   * GitHub numeric ID). Use together with `loginProvider` and
   * `IUserStore.findByProviderAccount` for safe OAuth account linking.
   */
  providerAccountId?: string | null;
  /**
   * Timestamp of the user's last successful login.  Useful for purging inactive
   * users or for auditing purposes.
   */
  lastLogin?: Date | null;
}
```

## GET /me — Rich User Profile

`GET /auth/me` (protected) fetches the full user record from the store and returns a safe, structured profile. Sensitive internal fields (`password`, `refreshToken`, `totpSecret`, `resetToken`, etc.) are **never** exposed.

### Default response

```json
{
  "id": "abc123",
  "email": "user@example.com",
  "role": "user",
  "loginProvider": "local",
  "isEmailVerified": true,
  "isTotpEnabled": false
}
```

### With `metadataStore` and `rbacStore`

Pass optional stores to `auth.router()` to enrich the profile automatically:

```typescript
app.use('/auth', auth.router({
  metadataStore: myMetadataStore,   // adds "metadata" field
  rbacStore:     myRbacStore,       // adds "roles" and "permissions" fields
}));
```

Response with both stores:

```json
{
  "id": "abc123",
  "email": "user@example.com",
  "role": "user",
  "loginProvider": "google",
  "isEmailVerified": true,
  "isTotpEnabled": true,
  "metadata": { "plan": "pro", "onboarded": true },
  "roles": ["editor", "viewer"],
  "permissions": ["posts:read", "posts:write"]
}
```

### Storing `firstName`, `lastName` and `loginProvider`

Add these optional fields to your user schema and populate them when creating users:

```typescript
// On OAuth sign-up, set loginProvider to the provider name
await userStore.create({
  email:         profile.email,
  firstName:     profile.name?.split(' ')[0],
  lastName:      profile.name?.split(' ').slice(1).join(' ') || null,
  loginProvider: 'google',
});

// On local registration
await userStore.create({
  email:         req.body.email,
  password:      hashedPassword,
  firstName:     req.body.firstName,
  lastName:      req.body.lastName,
  loginProvider: 'local',
});
```

## User Registration

`POST /auth/register` is **optional** — it is only mounted when you provide an `onRegister` callback in `RouterOptions`. This lets you opt out of self-registration entirely for projects where it is not needed.

```typescript
import { PasswordService } from 'awesome-node-auth';

const passwordService = new PasswordService();

app.use('/auth', auth.router({
  onRegister: async (data, config) => {
    // Validate input (add your own checks here)
    if (!data['email'] || !data['password']) {
      throw new AuthError('email and password are required', 'VALIDATION_ERROR', 400);
    }
    const hash = await passwordService.hash(
      data['password'] as string,
      config.bcryptSaltRounds,
    );
    return userStore.create({
      email:         data['email'] as string,
      password:      hash,
      firstName:     data['firstName'] as string | undefined,
      lastName:      data['lastName'] as string | undefined,
      loginProvider: 'local',
    });
  },
}));
```

**Request body** — any JSON object; `data` is the raw `req.body`.

**Response on success (201):**
```json
{ "success": true, "userId": "abc123" }
```

After creating the user, if `config.email.sendWelcome` or `config.email.mailer` is configured, a welcome email is sent automatically.

> **Tip:** Omit `onRegister` entirely for admin-only or invite-only systems where users should not be able to sign up themselves.

## Session Cleanup (Cron)

When using `ISessionStore`, expired session records accumulate in your database over time. The optional `POST /auth/sessions/cleanup` endpoint lets you purge them on a schedule.

### 1. Implement `deleteExpiredSessions` in your store

```typescript
export class MySessionStore implements ISessionStore {
  // ... other methods ...

  /** Delete sessions whose expiresAt is in the past. Returns the count deleted. */
  async deleteExpiredSessions(): Promise<number> {
    const result = await db('sessions').where('expiresAt', '<', new Date()).delete();
    return result; // number of deleted rows
  }
}
```

### 2. Mount the endpoint

```typescript
app.use('/auth', auth.router({
  sessionStore: mySessionStore,   // must implement deleteExpiredSessions
}));
```

### 3. Call it from a cron job

```typescript
// Example: node-cron (runs every day at midnight)
import cron from 'node-cron';

cron.schedule('0 0 * * *', async () => {
  const res = await fetch('https://yourapp.com/auth/sessions/cleanup', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CLEANUP_SECRET}` },
  });
  const { deleted } = await res.json();
  console.log(`Cleaned up ${deleted} expired sessions`);
});
```

> **Security:** Protect this endpoint with a rate limiter or a secret header in production to prevent abuse.

## CSRF Protection

The library supports the **double-submit cookie** pattern for CSRF defence, which is particularly important when `sameSite: 'none'` is used (e.g. cross-origin setups) or for defence-in-depth alongside `sameSite: 'lax'`.

### How it works

1. When CSRF is enabled, the library sets a non-`HttpOnly` cookie called `csrf-token` alongside the JWT cookies after every login/refresh.
2. Client-side JavaScript must read this cookie and send its value in the `X-CSRF-Token` header on every authenticated request.
3. `createAuthMiddleware` validates that the header value matches the cookie value. If they don't match, the request is rejected with **403 CSRF_INVALID**.

### Enabling CSRF

```typescript
const config: AuthConfig = {
  accessTokenSecret:  '...',
  refreshTokenSecret: '...',
  csrf: {
    enabled: true,   // default: false
  },
  cookieOptions: {
    secure:   true,
    sameSite: 'none',   // cross-origin scenario
  },
};
```

### Client-side integration

```typescript
// Helper: read a cookie by name
function getCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find(row => row.startsWith(name + '='))
    ?.split('=')[1];
}

// Add header to every authenticated request
async function authFetch(url: string, options: RequestInit = {}) {
  const csrfToken = getCookie('csrf-token');
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...options.headers,
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
  });
}

// Usage
await authFetch('/api/profile');
await authFetch('/auth/logout', { method: 'POST' });
```

> **Note:** CSRF protection is only meaningful for cookie-based authentication. If you use `Authorization: Bearer` headers instead of cookies, you do not need CSRF protection.

## Bearer Token Strategy

By default the library uses **HttpOnly cookies** to deliver tokens (recommended for browser-based apps). For API clients, mobile apps, or environments that cannot use cookies, you can switch to **bearer tokens** on a per-request basis — no configuration change required.

### How it works

1. Send the `X-Auth-Strategy: bearer` header with the login request.
2. The server returns the tokens in the JSON response body instead of setting cookies.
3. Store the tokens however is appropriate for your client (e.g. in memory for SPAs; secure storage for mobile apps). **Avoid `localStorage`** — it is vulnerable to XSS.
4. For every authenticated request send the access token in the `Authorization: Bearer` header.
5. To refresh, `POST /auth/refresh` with `{ refreshToken }` in the JSON body and the `X-Auth-Strategy: bearer` header — new tokens are returned in the body.

### Login (bearer)

```typescript
const res = await fetch('/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Auth-Strategy': 'bearer',
  },
  body: JSON.stringify({ email, password }),
});
const { accessToken, refreshToken } = await res.json();
// Store tokens securely (in-memory variable, not localStorage)
```

### Authenticated requests (bearer)

```typescript
await fetch('/api/profile', {
  headers: { Authorization: `Bearer ${accessToken}` },
});
```

### Refresh (bearer)

```typescript
const res = await fetch('/auth/refresh', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Auth-Strategy': 'bearer',
  },
  body: JSON.stringify({ refreshToken }),
});
const { accessToken: newAccessToken, refreshToken: newRefreshToken } = await res.json();
```

The `X-Auth-Strategy: bearer` header is respected by all token-issuing endpoints: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/2fa/verify`, `POST /auth/magic-link/verify`, and `POST /auth/sms/verify`.

> **Cookie users are unaffected** — if the `X-Auth-Strategy: bearer` header is absent, the library behaves exactly as before (HttpOnly cookies, optional CSRF protection).

### Flutter / Android / iOS

See [examples/flutter-integration.example.dart](examples/flutter-integration.example.dart) for a complete, copy-paste-ready Flutter client covering:

- Login with bearer token delivery (`X-Auth-Strategy: bearer`)
- Secure token storage via `flutter_secure_storage` (Keychain on iOS, EncryptedSharedPreferences on Android)
- Automatic access-token refresh with retry interceptor
- **OAuth login** (Google, GitHub, any provider) via `flutter_web_auth_2` — opens system browser (CustomTabs on Android, SFSafariViewController on iOS), intercepts the redirect back to the custom URL scheme
- **OAuth + 2FA**: extracts `tempToken` + `methods` from the 2FA redirect URL and completes via bearer-mode 2FA verify endpoint
- TOTP and SMS 2FA challenges
- Magic-link (passwordless) flow
- Change password, change email (with confirmation deep-link)
- Email verification (send + deep-link confirm)
- Account linking (`POST /auth/link-request` + `POST /auth/link-verify` via deep-link)
- List and unlink linked accounts
- Account deletion
- Admin REST API calls
- Example widgets: `LoginPage` (with OAuth buttons), `TwoFactorPage`, `ProfilePage`, `LinkedAccountsPage`

Deep-link setup notes for both Android (`AndroidManifest.xml`) and iOS (`Info.plist`) are included in the example file.

## Error Handling

The library throws `AuthError` for authentication failures:

```typescript
import { AuthError } from 'awesome-node-auth';

try {
  await localStrategy.authenticate({ email, password }, config);
} catch (err) {
  if (err instanceof AuthError) {
    console.log(err.code);       // e.g. 'INVALID_CREDENTIALS'
    console.log(err.statusCode); // e.g. 401
    console.log(err.message);    // e.g. 'Invalid credentials'
    console.log(err.data);       // optional structured payload (e.g. { email, providerAccountId } for OAUTH_ACCOUNT_CONFLICT)
  }
}
```

The optional `data` field carries additional context. For example, when `findOrCreateUser` throws `OAUTH_ACCOUNT_CONFLICT`, you can attach the conflicting account's details so the router can stash them via `IPendingLinkStore`:

```typescript
throw new AuthError(
  'Email already registered with a different provider',
  'OAUTH_ACCOUNT_CONFLICT',
  409,
  { email: profile.email, providerAccountId: profile.id },
);
```

Any unhandled errors thrown inside route handlers are caught by a global error middleware registered on the auth router. They are logged with `console.error('[awesome-node-auth] Unhandled router error: ...')` and return a generic `500 Internal server error` response so that stack traces are never leaked to clients.


## Custom Strategies

Extend `BaseAuthStrategy` to create custom authentication strategies:

```typescript
import { BaseAuthStrategy, AuthConfig } from 'awesome-node-auth';

class ApiKeyStrategy extends BaseAuthStrategy<{ apiKey: string }, MyUser> {
  name = 'api-key';

  async authenticate(input: { apiKey: string }, config: AuthConfig): Promise<MyUser> {
    const user = await myStore.findByApiKey(input.apiKey);
    if (!user) throw new AuthError('Invalid API key', 'INVALID_API_KEY', 401);
    return user;
  }
}
```

## Email Verification

The email-verification flow reuses the same token infrastructure as password reset and is available out of the box once you implement the three optional store methods.

### Verification modes

`AuthConfig.emailVerificationMode` controls how strictly email verification is enforced on login:

| Mode | Behaviour | Error code |
|------|-----------|------------|
| `'none'` | Never required (default) | — |
| `'lazy'` | Login allowed until `user.emailVerificationDeadline` expires | `EMAIL_VERIFICATION_REQUIRED` (403) |
| `'strict'` | Login blocked immediately if email is unverified | `EMAIL_NOT_VERIFIED` (403) |

```typescript
// Strict — block unverified users immediately
const config: AuthConfig = {
  emailVerificationMode: 'strict',
  // ...
};

// Lazy — allow login for 7 days, then require verification
const config: AuthConfig = {
  emailVerificationMode: 'lazy',
  // ...
};

// Set the deadline when creating the user (lazy mode only)
await userStore.create({
  email,
  password: hash,
  emailVerificationDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
});
```

> **Backward compatibility:** `requireEmailVerification: true` still works and is equivalent to `emailVerificationMode: 'strict'`.
> The admin ⚙️ Control panel also exposes `emailVerificationMode` so you can change the global policy at runtime without redeploying.

### IUserStore additions

```typescript
// Required to support /auth/send-verification-email and /auth/verify-email
updateEmailVerificationToken(userId, token, expiry): Promise<void>
updateEmailVerified(userId, isVerified): Promise<void>
findByEmailVerificationToken(token): Promise<U | null>
```

### AuthConfig email callbacks

```typescript
email: {
  // Called when a verification email is needed (takes precedence over mailer)
  sendVerificationEmail: async (to, token, link, lang?) => { /* ... */ },
  // Called after a successful email change (notifies the old address)
  sendEmailChanged: async (to, newEmail, lang?) => { /* ... */ },
}
```

### Flow

1. After registration, call `POST /auth/send-verification-email` (authenticated) — the library generates a 24-hour token, calls `updateEmailVerificationToken`, then fires `sendVerificationEmail`.
2. The user clicks the link in their inbox; the link points to `GET /auth/verify-email?token=<token>` — the library calls `updateEmailVerified(userId, true)` and clears the token.

```typescript
// Example: send on registration
app.post('/register', async (req, res) => {
  const user = await userStore.create({ email: req.body.email, password: hashedPw });
  // Log them in
  const tokens = tokenService.generateTokenPair({ sub: user.id, email: user.email }, config);
  tokenService.setTokenCookies(res, tokens, config);
  // Trigger verification email (the library does this automatically via the auth router)
  // or call the endpoint directly:
  await fetch('/auth/send-verification-email', {
    method: 'POST',
    headers: { Cookie: `accessToken=${tokens.accessToken}` },
  });
  res.json({ success: true });
});
```

## Change Password

`POST /auth/change-password` — **authenticated** — lets users update their password without going through the forgot-password flow.

**Request body:**
```json
{ "currentPassword": "OldP@ss1", "newPassword": "NewP@ss2" }
```

The endpoint verifies `currentPassword` against the stored bcrypt hash before applying the change. It returns `401` if the current password is wrong, or `400` for OAuth accounts that have no password set.

```typescript
// Client example (fetch)
await fetch('/auth/change-password', {
  method: 'POST',
  credentials: 'include',         // include HttpOnly cookies
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ currentPassword: 'old', newPassword: 'new' }),
});
```

No extra `IUserStore` methods are needed — `updatePassword` is already a required method.

## Change Email

The change-email flow sends a confirmation link to the new address before committing the update, preventing account hijacking.

### IUserStore additions

```typescript
// Required to support /auth/change-email/request and /auth/change-email/confirm
updateEmailChangeToken(userId, pendingEmail, token, expiry): Promise<void>
updateEmail(userId, newEmail): Promise<void>
findByEmailChangeToken(token): Promise<U | null>
```

### Flow

1. Authenticated user calls `POST /auth/change-email/request` with `{ "newEmail": "new@example.com" }`.  
   - The library checks the new address is not already in use.  
   - A 1-hour token is generated, stored via `updateEmailChangeToken`, and a verification email is sent to the **new address**.
2. User clicks the link; it points to `POST /auth/change-email/confirm` with `{ "token": "..." }`.  
   - The library calls `updateEmail` (commits the change) and sends an email-changed notification to the **old address** via `sendEmailChanged`.

```typescript
// 1. Request change
await fetch('/auth/change-email/request', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ newEmail: 'new@example.com' }),
});

// 2. Confirm (called from the link in the email)
await fetch('/auth/change-email/confirm', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: tokenFromLink }),
});
```

## Explicit Account Linking (`link-request` / `link-verify`)

An **authenticated** user can link a secondary email address (or tag it with any `provider` label) without going through a full OAuth redirect flow. The verification is email-based — the same pattern as change-email.

### IUserStore additions

```typescript
// Store a pending link token (called by POST /auth/link-request)
updateAccountLinkToken(
  userId: string,
  pendingEmail: string | null,
  pendingProvider: string | null,
  token: string | null,
  expiry: Date | null,
): Promise<void>

// Look up user by their pending link token (called by POST /auth/link-verify)
findByAccountLinkToken(token: string): Promise<U | null>
```

### Flow

1. Authenticated user calls `POST /auth/link-request` with `{ "email": "secondary@example.com", "provider": "email" }`.  
   - A 1-hour token is generated, stored via `updateAccountLinkToken`, and a verification email is sent to the **target address** via `sendVerificationEmail`.
2. User clicks the link (or the frontend extracts the `?token=` param and posts it).  
   - `POST /auth/link-verify` with `{ "token": "..." }` validates the token and calls `linkedAccountsStore.linkAccount()`.  
   - The token is cleared; the new account appears in `GET /auth/linked-accounts`.
   - Pass `"loginAfterLinking": true` to also receive a full session immediately.

```typescript
// 1. Request link (authenticated)
await fetch('/auth/link-request', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'secondary@example.com', provider: 'email' }),
});

// 2a. Verify only (called from the link in the email — no auth required)
await fetch('/auth/link-verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: tokenFromLink }),
});

// 2b. Verify AND get a session in one call (useful for unauthenticated flows)
const res = await fetch('/auth/link-verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: tokenFromLink, loginAfterLinking: true }),
});
// → tokens set as cookies (or in body for X-Auth-Strategy: bearer); user is now logged in
```

Both endpoints are only mounted when `linkedAccountsStore` is provided in `RouterOptions`. `link-request` also requires `email.sendVerificationEmail` (or `email.mailer`) to be configured so it can send the email.

> **Tip:** Pass `loginAfterLinking: true` in the `/auth/link-verify` body to receive a full session (tokens set as cookies, or in the JSON body for `X-Auth-Strategy: bearer`) immediately after the link is confirmed — no separate login step needed. This is especially useful for the unauthenticated conflict-linking flow driven by `IPendingLinkStore`.

## TOTP Two-Factor Authentication — Full UI Integration Guide

TOTP (Time-based One-Time Password) is the **Google Authenticator / Authy** style 2FA. The following is the complete flow from both the server and UI perspective.

### Prerequisites

The user must be logged in (have a valid `accessToken` cookie or Bearer token).

### Step 1 — Generate a secret and display the QR code

Call `POST /auth/2fa/setup` from your settings page. The response contains:
- `secret` — base32-encoded TOTP secret (store it temporarily in the UI, **never** in localStorage)
- `otpauthUrl` — the `otpauth://` URI (used to generate the QR code)
- `qrCode` — a `data:image/png;base64,...` data URL you can put directly into an `<img>` tag

```typescript
// Client-side (authenticated)
const res = await fetch('/auth/2fa/setup', {
  method: 'POST',
  credentials: 'include',          // sends the accessToken cookie
});
const { secret, qrCode } = await res.json();

// Display in your UI
document.getElementById('qr-img').src = qrCode;
document.getElementById('secret-text').textContent = secret; // for manual entry
```

**UI tip:** Show both the QR code and the plain-text secret. Some users cannot scan QR codes (accessibility, older devices).

```html
<!-- Example setup UI -->
<div id="totp-setup">
  <p>Scan this QR code with Google Authenticator, Authy, or any TOTP app:</p>
  <img id="qr-img" alt="TOTP QR code" />
  <p>Or enter this code manually: <code id="secret-text"></code></p>

  <label>Enter the 6-digit code shown in the app to confirm:</label>
  <input id="totp-input" type="text" maxlength="6" inputmode="numeric" autocomplete="one-time-code" />
  <button onclick="verifySetup()">Enable 2FA</button>
</div>
```

### Step 2 — Verify the setup and persist the secret

The user enters the 6-digit code from their authenticator app. Call `POST /auth/2fa/verify-setup` with both the code **and** the secret returned from step 1.

```typescript
async function verifySetup() {
  const code   = document.getElementById('totp-input').value.trim();
  const secret = document.getElementById('secret-text').textContent; // from step 1

  const res = await fetch('/auth/2fa/verify-setup', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: code, secret }),
  });

  if (res.ok) {
    // 2FA is now enabled — update UI, redirect to settings
    alert('Two-factor authentication enabled!');
  } else {
    const { error } = await res.json();
    alert('Invalid code: ' + error);
  }
}
```

The server calls `updateTotpSecret(userId, secret)` which sets `isTotpEnabled = true` on the user.

### Step 3 — Login with 2FA

The 2FA challenge is triggered in two situations:

1. **TOTP enabled**: the user has set up an authenticator app (`isTotpEnabled = true`).
2. **`require2FA` flag**: the admin has flagged the user (or a global policy applies) — works with **any** configured channel including magic-link, so users who only have an email address can still use 2FA without setting up an authenticator app.

When either condition is met, `POST /auth/login` responds with:

```json
{
  "requiresTwoFactor": true,
  "tempToken": "<short-lived JWT>",
  "available2faMethods": ["totp", "sms", "magic-link"]
}
```

- `tempToken` expires in **5 minutes** — use it immediately.
- `available2faMethods` lists which 2FA channels are available to this specific user (see [Multi-channel 2FA](#multi-channel-2fa) below).

If `require2FA` is set but **no** method is configured for the user (no TOTP, no phone, and no email sender), the server returns:

```json
{ "requires2FASetup": true, "tempToken": "...", "code": "2FA_SETUP_REQUIRED" }
```

with HTTP **403** — prompt the user to set up at least one 2FA method.

Show a code-entry UI and call `POST /auth/2fa/verify`:

```typescript
// After detecting requiresTwoFactor === true in the login response:
let tempToken = data.tempToken;

async function submit2fa() {
  const totpCode = document.getElementById('totp-code-input').value.trim();

  const res = await fetch('/auth/2fa/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tempToken, totpCode }),
  });

  if (res.ok) {
    // Full session tokens are now set as HttpOnly cookies
    window.location.href = '/dashboard';
  } else {
    const { error } = await res.json();
    alert('Invalid code: ' + error);
  }
}
```

```html
<!-- TOTP verification UI (shown after login step 1) -->
<div id="totp-verify">
  <p>Enter the 6-digit code from your authenticator app:</p>
  <input id="totp-code-input" type="text" maxlength="6" inputmode="numeric"
         autocomplete="one-time-code" autofocus />
  <button onclick="submit2fa()">Verify</button>
</div>
```

### Step 4 — Disable 2FA

Call `POST /auth/2fa/disable` (authenticated):

```typescript
await fetch('/auth/2fa/disable', {
  method: 'POST',
  credentials: 'include',
});
```

The server clears `totpSecret` and sets `isTotpEnabled = false`.

---

## Multi-Channel 2FA — SMS and Magic-Link as Second Factor

After a successful `POST /auth/login` that returns `requiresTwoFactor: true`, the response includes `available2faMethods` — an array listing which 2FA channels are configured for the user.

The 2FA challenge is triggered when the user has `isTotpEnabled = true` **or** `require2FA = true`. The `require2FA` flag does **not** require an authenticator app — magic-link is a valid second factor on its own.

| Value | When it appears |
|-------|----------------|
| `'totp'` | User has `isTotpEnabled = true` and a stored `totpSecret` |
| `'sms'` | User has a stored `phoneNumber` **and** `config.sms` is configured |
| `'magic-link'` | `config.email.sendMagicLink` or `config.email.mailer` is configured |

Your UI can let the user pick their preferred channel:

```typescript
const loginRes = await fetch('/auth/login', { /* ... */ });
const { requiresTwoFactor, tempToken, available2faMethods } = await loginRes.json();

if (requiresTwoFactor) {
  // Offer available channels to the user
  show2faChannelPicker(available2faMethods, tempToken);
}
```

### 2FA via SMS

**Step A — Request the code:**

```typescript
await fetch('/auth/sms/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mode: '2fa', tempToken }),
});
// The server validates the tempToken, finds the user's stored phoneNumber, and sends an OTP.
```

**Step B — Submit the code:**

```typescript
const res = await fetch('/auth/sms/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mode: '2fa', tempToken, code: userEnteredCode }),
});
// On success, full session tokens are issued via HttpOnly cookies.
```

### 2FA via Magic-Link

**Step A — Request the magic link:**

```typescript
await fetch('/auth/magic-link/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mode: '2fa', tempToken }),
});
// The server validates the tempToken, finds the user's email, and sends a magic link.
```

**Step B — Verify the link** (called from the link in the email):

```typescript
// Extract `token` from the link: /auth/magic-link/verify?token=...
const res = await fetch('/auth/magic-link/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: tokenFromLink, mode: '2fa', tempToken }),
});
// On success, full session tokens are issued via HttpOnly cookies.
```

> **Security note:** In `mode='2fa'`, both the magic-link token and the `tempToken` are validated. The magic link must belong to the same user identified by the `tempToken`, preventing account takeover even if a magic-link token is stolen.

---

## Direct Passwordless Login

### SMS Direct Login

Users can log in by phone without a password. You can identify the user by their stored `userId` **or** by the `email` associated with their account (the stored `phoneNumber` is used either way):

```typescript
// Option A — identify by userId
await fetch('/auth/sms/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: '123' }),       // mode: 'login' is the default
});

// Option B — identify by email (user enters their email; the stored phone is used)
await fetch('/auth/sms/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@example.com' }),
});
// If the email is not found the endpoint silently returns { success: true }
// to prevent user enumeration.
```

Then verify the code to get full session tokens:

```typescript
await fetch('/auth/sms/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: '123', code: '123456' }),
});
```

### Magic-Link Direct Login

Magic-link direct login is unchanged — no `mode` parameter needed:

```typescript
// Send
await fetch('/auth/magic-link/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@example.com' }),
});

// Verify (called when user clicks the link)
await fetch('/auth/magic-link/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: tokenFromLink }),
});
```

## Admin Panel

`createAdminRouter` mounts a **self-contained admin panel** — both the REST API and a vanilla-JS UI — at any path you choose. No build step, no external UI dependencies.

```typescript
import { createAdminRouter } from 'awesome-node-auth';

app.use('/admin', createAdminRouter(userStore, {
  adminSecret: process.env.ADMIN_SECRET!,  // Bearer token required for all admin routes
  sessionStore,         // optional — enables Sessions tab
  rbacStore,            // optional — enables Roles & Permissions tab + user-role assignment
  tenantStore,          // optional — enables Tenants tab + user-tenant membership
  userMetadataStore,    // optional — enables Metadata editor in the user panel
  settingsStore,        // optional — enables ⚙️ Control tab (mandatory email verification / 2FA toggles)
  linkedAccountsStore,  // optional — shows Linked Accounts column + detail section in Users tab
  apiKeyStore,          // optional — enables 🔑 API Keys tab (list, revoke, delete, create)
  webhookStore,         // optional — enables 🔗 Webhooks tab (list, create, toggle, delete)
}));
```

Open `http://localhost:3000/admin/` in your browser, enter the admin secret, and you get a tabbed dashboard:

| Tab | Requires | Features |
|-----|----------|---------|
| **👤 Users** | `IUserStore.listUsers` | Paginated user table, server-side `?filter=`, per-row checkboxes, batch-delete, **Linked Accounts** preview column, **Manage** panel per user |
| **📋 Sessions** | `ISessionStore.getAllSessions` | All active sessions, server-side `?filter=`, revoke by handle |
| **🛡️ Roles & Permissions** | `IRolesPermissionsStore.getAllRoles` | List roles with permissions, client-side filter, create/delete roles |
| **🏢 Tenants** | `ITenantStore.getAllTenants` | List tenants, client-side filter, create/delete tenants, manage members |
| **🔑 API Keys** | `apiKeyStore` (see below) | List all API keys, revoke (soft), delete (hard), create new key (rawKey shown once) |
| **🔗 Webhooks** | `webhookStore` (see below) | List all outgoing webhook registrations, register new, toggle active/inactive, delete |
| **⚙️ Control** | `settingsStore` (see below) | Toggle **Mandatory Email Verification** and **Mandatory 2FA** globally |

The **Manage** panel (click the "Manage" button in the Users table) provides:
- **Role assignment** — assign/remove roles when `rbacStore` is configured
- **Tenant assignment** — assign/unassign tenants directly from the user row when `tenantStore` is configured
- **Metadata editor** — view and edit raw JSON metadata when `userMetadataStore` is configured
- **Linked Accounts** — full list of linked providers (name, email, linked-at) when `linkedAccountsStore` is configured

Tabs and features that are not configured are hidden automatically.

### API Keys tab — `apiKeyStore`

Pass an `IApiKeyStore` implementation to enable the **🔑 API Keys** tab.  The tab lets you:
- List all keys (prefix, name, service ID, scopes, status, expiry, last used)
- **Revoke** a key instantly (`isActive: false`)
- **Delete** a key permanently (falls back to revoke if `IApiKeyStore.delete` is not implemented)
- **Create** a new key — fill in name, service ID, scopes, allowed IPs and expiry, then copy the `rawKey` from the one-time banner (it is never shown again)

The store must implement `listAll` for listing; `revoke` is always required; `delete` is optional.

```typescript
app.use('/admin', createAdminRouter(userStore, {
  adminSecret: '…',
  apiKeyStore: myApiKeyStore,   // see IApiKeyStore
}));
```

### Webhooks tab — `webhookStore`

Pass an `IWebhookStore` implementation with the optional admin CRUD methods to enable the **🔗 Webhooks** tab:

```typescript
app.use('/admin', createAdminRouter(userStore, {
  adminSecret: '…',
  webhookStore: myWebhookStore,  // must implement listAll, add, remove, update
}));
```

The tab lets you:
- List all registered outgoing webhooks (URL, subscribed events, scope, active status, HMAC signing indicator)
- **Register** a new webhook (URL, event patterns, optional HMAC secret, optional tenant scope)
- **Enable / Disable** a webhook (toggles `isActive`)
- **Delete** a webhook registration permanently

The `secret` field is always masked as `***` in the listing response.

### Control tab — `settingsStore`

Supply an object with two async methods to enable the **⚙️ Control** tab:

```typescript
const settings: Record<string, unknown> = {};

app.use('/admin', createAdminRouter(userStore, {
  adminSecret: '…',
  settingsStore: {
    async getSettings() { return { ...settings }; },
    async updateSettings(s) { Object.assign(settings, s); },
  },
}));
```

For persistence, replace the in-memory object with your database:

```typescript
settingsStore: {
  async getSettings() { return db('settings').first(); },
  async updateSettings(s) { await db('settings').update(s); },
},
```

### Admin REST API

All admin API endpoints require `Authorization: Bearer <adminSecret>`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/api/ping` | Health check / auth verification |
| `GET` | `/admin/api/users` | List users (`?limit=&offset=&filter=`) |
| `GET` | `/admin/api/users/:id` | Get single user |
| `DELETE` | `/admin/api/users/:id` | Delete user (requires `IUserStore.deleteUser`) |
| `GET` | `/admin/api/users/:id/roles` | List roles assigned to a user |
| `POST` | `/admin/api/users/:id/roles` | Assign a role to a user (`{ role, tenantId? }`) |
| `DELETE` | `/admin/api/users/:id/roles/:role` | Remove a role from a user |
| `GET` | `/admin/api/users/:id/metadata` | Get user metadata |
| `PUT` | `/admin/api/users/:id/metadata` | Replace user metadata (full JSON body) |
| `GET` | `/admin/api/users/:id/linked-accounts` | List OAuth accounts linked to a user _(requires `linkedAccountsStore`)_ |
| `GET` | `/admin/api/users/:id/tenants` | List tenant IDs the user belongs to |
| `GET` | `/admin/api/sessions` | List all sessions (`?limit=&offset=&filter=`) |
| `DELETE` | `/admin/api/sessions/:handle` | Revoke a session |
| `GET` | `/admin/api/roles` | List all roles with permissions |
| `POST` | `/admin/api/roles` | Create a role |
| `DELETE` | `/admin/api/roles/:name` | Delete a role |
| `GET` | `/admin/api/tenants` | List all tenants |
| `POST` | `/admin/api/tenants` | Create a tenant |
| `DELETE` | `/admin/api/tenants/:id` | Delete a tenant |
| `GET` | `/admin/api/tenants/:id/users` | List user IDs belonging to a tenant |
| `POST` | `/admin/api/tenants/:id/users` | Add a user to a tenant (`{ userId }`) |
| `DELETE` | `/admin/api/tenants/:id/users/:userId` | Remove a user from a tenant |
| `GET` | `/admin/api/settings` | Get current global settings (requires `settingsStore`) |
| `PUT` | `/admin/api/settings` | Update global settings (requires `settingsStore`) |
| `GET` | `/admin/api/api-keys` | List all API keys (`?limit=&offset=&filter=`) — requires `apiKeyStore` |
| `POST` | `/admin/api/api-keys` | Create an API key (`{ name, serviceId?, scopes?, allowedIps?, expiresAt? }`) — returns `rawKey` once |
| `DELETE` | `/admin/api/api-keys/:id/revoke` | Revoke a key (sets `isActive: false`) |
| `DELETE` | `/admin/api/api-keys/:id` | Hard-delete a key (falls back to revoke if `IApiKeyStore.delete` not implemented) |
| `GET` | `/admin/api/webhooks` | List all webhook registrations (`?limit=&offset=`) — requires `webhookStore` |
| `POST` | `/admin/api/webhooks` | Register a new outgoing webhook (`{ url, events?, secret?, tenantId?, isActive? }`) |
| `PATCH` | `/admin/api/webhooks/:id` | Partial update a webhook (e.g. toggle `isActive`) |
| `DELETE` | `/admin/api/webhooks/:id` | Delete a webhook registration |

> **Security note:** Mount the admin router behind a VPN or IP allow-list in production. The `adminSecret` is a single shared token — treat it like a root password.

## RouterOptions

All options passed to `auth.router(options)` (or `createAuthRouter(store, config, options)`):

| Option | Type | Description |
|--------|------|-------------|
| `rateLimiter` | `RequestHandler` | Applied to all sensitive auth endpoints (login, refresh, 2FA, etc.) |
| `googleStrategy` | `GoogleStrategy` | Enables `GET /auth/oauth/google` |
| `githubStrategy` | `GithubStrategy` | Enables `GET /auth/oauth/github` |
| `oauthStrategies` | `GenericOAuthStrategy[]` | Enables `GET /auth/oauth/:name` for any additional provider |
| `linkedAccountsStore` | `ILinkedAccountsStore` | Enables `GET /auth/linked-accounts`, `DELETE /auth/linked-accounts/:provider/:id`, `POST /auth/link-request`, and `POST /auth/link-verify` |
| `settingsStore` | `ISettingsStore` | Enables system 2FA policy check in `POST /auth/2fa/disable` |
| `onRegister` | `(data, config) => Promise<BaseUser>` | Enables `POST /auth/register` |
| `metadataStore` | `IUserMetadataStore` | Adds `metadata` field to `GET /me` response |
| `rbacStore` | `IRolesPermissionsStore` | Adds `roles` and `permissions` fields to `GET /me` response |
| `sessionStore` | `ISessionStore` (with `deleteExpiredSessions`) | Enables `POST /auth/sessions/cleanup` |
| `tenantStore` | `ITenantStore` | When provided, `DELETE /auth/account` also removes the user from all their tenants |
| `swagger` | `boolean \| 'auto'` | Enable Swagger UI + OpenAPI spec. `'auto'` (default) — enabled when `NODE_ENV !== 'production'` |
| `swaggerBasePath` | `string` | Base path for accurate OpenAPI path entries; must match the mount path (default: `'/auth'`) |

Auth routes should be rate-limited in production to prevent brute-force attacks. Pass an optional `rateLimiter` middleware to `createAuthRouter()`:

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

app.use('/auth', auth.router({ rateLimiter: limiter }));
```

All sensitive endpoints (login, refresh, password reset, 2FA, magic links, SMS) will be protected.

## Custom Identity Claims

Inject arbitrary project-specific data into both the Access/Refresh JWTs and the profile response by providing `buildTokenPayload` in `AuthConfig`. 
The returned object is **merged** on top of the standard fields:
- **JWTs**: Merged with `{ sub, email, role }`.
- **`/api/auth/me`**: Merged with the standard profile JSON (e.g., `email`, `id`, `loginProvider`).
This ensures that critical security flags (like `hasPassword`) or custom metadata are available to the frontend regardless of the authentication strategy (Bearer Tokens or HttpOnly Cookies).

```typescript
import { AuthConfigurator, AuthConfig } from 'awesome-node-auth';

const config: AuthConfig = {
  accessTokenSecret: '...',
  refreshTokenSecret: '...',
  buildTokenPayload: (user) => ({
    permissions: user.permissions,   // your extended user fields
    tenantId:    user.tenantId,
    plan:        user.plan,
  }),
};

const auth = new AuthConfigurator(config, userStore);
```

After login the custom claims are available on `req.user` in any protected route:

```typescript
app.get('/protected', auth.middleware(), (req, res) => {
  // req.user.tenantId, req.user.permissions, etc.
  res.json(req.user);
});
```
The table below shows the default claims:
|CLAIM |VALUE |
|------|------|
|sub |user.id |
|email |user.email |
|role |user.role |
|loginProvider |user.loginProvider??'local' |
|isEmailVerified |user.isEmailVerified??'false' |
|isTotpEnabled |user.isTotpEnabled??'false' |

If you want to include additional user information such as `firstName`, `lastName`, or `phoneNumber` into the payload, you must explicitly return them in the `buildTokenPayload` callback shown above. 
Any data you inject via this callback becomes automatically available directly inside the JWT (when using Bearer tokens) and is returned seamlessly as part of the JSON profile response on the `/auth/me` endpoint (when using cookie-based access).
## User Metadata

`IUserMetadataStore` is an **optional** interface for attaching arbitrary key/value metadata to users without altering `BaseUser` or your users table.

```typescript
import { IUserMetadataStore } from 'awesome-node-auth';

export class MyUserMetadataStore implements IUserMetadataStore {
  /** Return all metadata for a user; empty object when none exists. */
  async getMetadata(userId: string): Promise<Record<string, unknown>> {
    const row = await db('user_metadata').where({ userId }).first();
    return row ? JSON.parse(row.data) : {};
  }

  /** Shallow-merge new key/value pairs into the existing metadata. */
  async updateMetadata(userId: string, metadata: Record<string, unknown>): Promise<void> {
    const existing = await this.getMetadata(userId);
    const merged = { ...existing, ...metadata };
    await db('user_metadata')
      .insert({ userId, data: JSON.stringify(merged) })
      .onConflict('userId').merge();
  }

  /** Remove all metadata for the user (e.g. on account deletion). */
  async clearMetadata(userId: string): Promise<void> {
    await db('user_metadata').where({ userId }).delete();
  }
}
```

### Usage

```typescript
const metaStore = new MyUserMetadataStore();

// Store preferences after login
await metaStore.updateMetadata(userId, { theme: 'dark', lang: 'it', onboarded: true });

// Read them back
const meta = await metaStore.getMetadata(userId);
console.log(meta.theme); // 'dark'
```

## Roles & Permissions

`IRolesPermissionsStore` is an **optional** interface for role-based access control (RBAC). It supports both single-tenant and multi-tenant applications via an optional `tenantId` parameter.

```typescript
import { IRolesPermissionsStore } from 'awesome-node-auth';

export class MyRbacStore implements IRolesPermissionsStore {
  // User ↔ Role
  async addRoleToUser(userId: string, role: string, tenantId?: string): Promise<void> { /* ... */ }
  async removeRoleFromUser(userId: string, role: string, tenantId?: string): Promise<void> { /* ... */ }
  async getRolesForUser(userId: string, tenantId?: string): Promise<string[]> { /* ... */ }

  // Role management
  async createRole(role: string, permissions?: string[]): Promise<void> { /* ... */ }
  async deleteRole(role: string): Promise<void> { /* ... */ }

  // Role ↔ Permission
  async addPermissionToRole(role: string, permission: string): Promise<void> { /* ... */ }
  async removePermissionFromRole(role: string, permission: string): Promise<void> { /* ... */ }
  async getPermissionsForRole(role: string): Promise<string[]> { /* ... */ }

  // Convenience
  async getPermissionsForUser(userId: string, tenantId?: string): Promise<string[]> { /* ... */ }
  async userHasPermission(userId: string, permission: string, tenantId?: string): Promise<boolean> { /* ... */ }
}
```

### Usage

```typescript
const rbac = new MyRbacStore();

// Create roles with permissions
await rbac.createRole('editor', ['posts:read', 'posts:write']);
await rbac.createRole('admin',  ['posts:read', 'posts:write', 'users:manage']);

// Assign a role to a user (optionally scoped to a tenant)
await rbac.addRoleToUser(userId, 'editor', 'tenant-acme');

// Protect a route
app.delete('/posts/:id', auth.middleware(), async (req, res) => {
  const allowed = await rbac.userHasPermission(req.user!.sub, 'posts:write', req.user!.tenantId as string | undefined);
  if (!allowed) return res.status(403).json({ error: 'Forbidden' });
  // ... delete post
});
```

### Combining with `buildTokenPayload`

You can embed roles/permissions directly in the JWT so route guards do not need an async DB call:

```typescript
buildTokenPayload: async (user) => ({
  roles:       await rbac.getRolesForUser(user.id),
  permissions: await rbac.getPermissionsForUser(user.id),
}),
```

## Session Management

`ISessionStore` is an **optional** interface for device-aware session management — useful for "active sessions" screens where users can see and revoke individual devices.

```typescript
import { ISessionStore, SessionInfo } from 'awesome-node-auth';

export class MySessionStore implements ISessionStore {
  async createSession(info: Omit<SessionInfo, 'sessionHandle'>): Promise<SessionInfo> {
    const sessionHandle = crypto.randomUUID();
    await db('sessions').insert({ sessionHandle, ...info });
    return { sessionHandle, ...info };
  }
  async getSession(sessionHandle: string): Promise<SessionInfo | null> {
    return db('sessions').where({ sessionHandle }).first() ?? null;
  }
  async getSessionsForUser(userId: string, tenantId?: string): Promise<SessionInfo[]> {
    return db('sessions').where({ userId, ...(tenantId ? { tenantId } : {}) });
  }
  async updateSessionLastActive(sessionHandle: string): Promise<void> {
    await db('sessions').where({ sessionHandle }).update({ lastActiveAt: new Date() });
  }
  async revokeSession(sessionHandle: string): Promise<void> {
    await db('sessions').where({ sessionHandle }).delete();
  }
  async revokeAllSessionsForUser(userId: string, tenantId?: string): Promise<void> {
    await db('sessions').where({ userId, ...(tenantId ? { tenantId } : {}) }).delete();
  }
}
```

### Usage

```typescript
const sessions = new MySessionStore();

// Create a session on login (combine with the auth router's login handler)
const session = await sessions.createSession({
  userId,
  createdAt:  new Date(),
  expiresAt:  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  userAgent:  req.headers['user-agent'],
  ipAddress:  req.ip,
});

// List active sessions for a "Manage devices" page
app.get('/sessions', auth.middleware(), async (req, res) => {
  const list = await sessions.getSessionsForUser(req.user!.sub);
  res.json(list);
});

// Revoke a specific session
app.delete('/sessions/:handle', auth.middleware(), async (req, res) => {
  await sessions.revokeSession(req.params.handle);
  res.json({ success: true });
});
```

### `SessionInfo` model

```typescript
interface SessionInfo {
  sessionHandle: string;       // Unique opaque identifier
  userId:        string;
  tenantId?:     string;       // Optional tenant scope
  createdAt:     Date;
  expiresAt:     Date;
  lastActiveAt?: Date;         // Bumped on each authenticated request
  userAgent?:    string;
  ipAddress?:    string;
  data?:         Record<string, unknown>; // Any extra device/context data
}
```

## Multi-Tenancy

`ITenantStore` is an **optional** interface for applications that serve multiple independent tenants (organisations, workspaces, teams).

```typescript
import { ITenantStore, Tenant } from 'awesome-node-auth';

export class MyTenantStore implements ITenantStore {
  // Tenant CRUD
  async createTenant(data: Omit<Tenant, 'id'>): Promise<Tenant> { /* ... */ }
  async getTenantById(id: string): Promise<Tenant | null> { /* ... */ }
  async getAllTenants(): Promise<Tenant[]> { /* ... */ }
  async updateTenant(id: string, data: Partial<Omit<Tenant, 'id'>>): Promise<void> { /* ... */ }
  async deleteTenant(id: string): Promise<void> { /* ... */ }

  // User ↔ Tenant membership
  async associateUserWithTenant(userId: string, tenantId: string): Promise<void> { /* ... */ }
  async disassociateUserFromTenant(userId: string, tenantId: string): Promise<void> { /* ... */ }
  async getTenantsForUser(userId: string): Promise<Tenant[]> { /* ... */ }
  async getUsersForTenant(tenantId: string): Promise<string[]> { /* ... */ }
}
```

### Usage

```typescript
const tenants = new MyTenantStore();

// Onboarding: create a tenant and assign the first user as owner
const tenant = await tenants.createTenant({ name: 'Acme Corp', isActive: true });
await tenants.associateUserWithTenant(userId, tenant.id);

// Inject tenantId into the JWT via buildTokenPayload.
// For users that belong to a single tenant this works directly.
// For users with multiple tenants, embed the full list and let the
// client pass an `X-Tenant-ID` header that is validated per-request.
buildTokenPayload: async (user) => ({
  tenants: (await tenants.getTenantsForUser(user.id)).map(t => t.id),
}),

// Guard: ensure user belongs to the requested tenant
app.get('/tenants/:id/data', auth.middleware(), async (req, res) => {
  const userTenants = await tenants.getTenantsForUser(req.user!.sub);
  if (!userTenants.find(t => t.id === req.params.id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  // ... return tenant data
});
```

### `Tenant` model

```typescript
interface Tenant {
  id:        string;                      // Unique identifier (slug, UUID, etc.)
  name:      string;
  isActive?: boolean;                     // Defaults to true
  config?:   Record<string, unknown>;    // Per-tenant settings (branding, feature flags, etc.)
  createdAt?: Date;
}
```

## Event-Driven Tools (Optional)

The library includes an optional event-driven layer that turns awesome-node-auth into an
**identity platform**. All features are **zero-overhead when disabled** — simply
don't instantiate `AuthTools` and nothing runs.

### Architecture overview

```
Auth Core
   ↓
AuthEventBus  ← backbone (EventEmitter)
   ↓
AuthTools
   ├── ITelemetryStore   ← persist events to any DB
   ├── SseManager        ← real-time browser/client notifications
   ├── WebhookSender     ← outgoing webhooks with HMAC + retry
   └── IWebhookStore     ← webhook subscription registry
```

### Quick setup

```ts
import {
  AuthEventBus,
  AuthEventNames,
  AuthTools,
  createToolsRouter,
} from 'awesome-node-auth';

// 1. Create the event bus
const bus = new AuthEventBus();

// 2. Create the tools module
const tools = new AuthTools(bus, {
  telemetryStore: myTelemetryStore, // optional
  webhookStore: myWebhookStore,     // optional
  sse: true,                        // enable real-time SSE
});

// 3. Mount the /tools HTTP router (optional)
app.use('/tools', createToolsRouter(tools, {
  authMiddleware: auth.middleware(),
  onWebhook: async (provider, body) => {
    // map inbound webhook to an internal event
    return { event: 'identity.auth.oauth.success', data: body };
  },
}));

// 4. Track events from your own code
await tools.track(AuthEventNames.AUTH_LOGIN_SUCCESS, { email }, {
  userId: user.id,
  tenantId: user.tenantId,
  ip: req.ip,
});
```

### AuthEventBus

A thin `EventEmitter` wrapper.  Emit events with `publish()` and subscribe with `onEvent()`.

```ts
const bus = new AuthEventBus();

// Subscribe to a specific event
bus.onEvent(AuthEventNames.USER_CREATED, (payload) => {
  console.log('New user:', payload.userId, payload.tenantId);
});

// Subscribe to ALL events via the wildcard channel
bus.onEvent('*', (payload) => {
  metricsCollector.inc(payload.event);
});

// Publish programmatically
bus.publish(AuthEventNames.AUTH_LOGIN_FAILED, {
  userId: user.id,
  ip: req.ip,
  data: { reason: 'bad_password' },
});
```

### Standard Event Names

All event names follow the `domain.resource.action` convention:

| Constant | Value |
|---|---|
| `USER_CREATED` | `identity.user.created` |
| `USER_DELETED` | `identity.user.deleted` |
| `USER_EMAIL_VERIFIED` | `identity.user.email.verified` |
| `USER_PASSWORD_CHANGED` | `identity.user.password.changed` |
| `USER_2FA_ENABLED` | `identity.user.2fa.enabled` |
| `USER_2FA_DISABLED` | `identity.user.2fa.disabled` |
| `USER_LINKED` | `identity.user.linked` |
| `USER_UNLINKED` | `identity.user.unlinked` |
| `SESSION_CREATED` | `identity.session.created` |
| `SESSION_REVOKED` | `identity.session.revoked` |
| `SESSION_EXPIRED` | `identity.session.expired` |
| `SESSION_ROTATED` | `identity.session.rotated` |
| `AUTH_LOGIN_SUCCESS` | `identity.auth.login.success` |
| `AUTH_LOGIN_FAILED` | `identity.auth.login.failed` |
| `AUTH_LOGOUT` | `identity.auth.logout` |
| `AUTH_OAUTH_SUCCESS` | `identity.auth.oauth.success` |
| `AUTH_OAUTH_CONFLICT` | `identity.auth.oauth.conflict` |
| `TENANT_CREATED` | `identity.tenant.created` |
| `TENANT_DELETED` | `identity.tenant.deleted` |
| `TENANT_USER_ADDED` | `identity.tenant.user.added` |
| `TENANT_USER_REMOVED` | `identity.tenant.user.removed` |
| `ROLE_ASSIGNED` | `identity.role.assigned` |
| `ROLE_REVOKED` | `identity.role.revoked` |
| `PERMISSION_GRANTED` | `identity.permission.granted` |
| `PERMISSION_REVOKED` | `identity.permission.revoked` |

### Telemetry — `ITelemetryStore`

Implement `ITelemetryStore` to persist events in any database:

```ts
import { ITelemetryStore, TelemetryEvent } from 'awesome-node-auth';

export class MyTelemetryStore implements ITelemetryStore {
  async save(event: TelemetryEvent): Promise<void> {
    await db('telemetry').insert(event);
  }

  // Optional — enables GET /tools/telemetry query endpoint
  async query(filter: TelemetryFilter): Promise<TelemetryEvent[]> {
    let q = db('telemetry');
    if (filter.event)    q = q.where('event', filter.event);
    if (filter.userId)   q = q.where('userId', filter.userId);
    if (filter.tenantId) q = q.where('tenantId', filter.tenantId);
    if (filter.from)     q = q.where('timestamp', '>=', filter.from.toISOString());
    if (filter.to)       q = q.where('timestamp', '<=', filter.to.toISOString());
    return q.limit(filter.limit ?? 100).offset(filter.offset ?? 0);
  }
}
```

### Real-time Notifications — SSE

Enable SSE when creating `AuthTools`:

```ts
const tools = new AuthTools(bus, { sse: true });
```

**Subscribe (client-side):**

```ts
const es = new EventSource('/tools/stream', { withCredentials: true });
es.addEventListener('identity.auth.login.success', (e) => {
  const event = JSON.parse(e.data);
  console.log('Login event:', event);
});
```

**Topic hierarchy** (server-controlled, clients cannot self-declare):

```
global                              – all authenticated users
tenant:{tenantId}                   – all users of a tenant
tenant:{tenantId}:role:{role}       – users with a specific role
tenant:{tenantId}:group:{groupId}   – users in a group
user:{userId}                       – single user
session:{sessionId}                 – single session
custom:{namespace}                  – any custom topic
```

**Notify a topic programmatically:**

```ts
// server-side
tools.notify('user:123', { message: 'Your password was changed.' }, {
  type: 'security-alert',
  tenantId: 'acme',
});
```

**HTTP API:**

```
GET  /tools/stream               – SSE stream (Accept: text/event-stream)
POST /tools/notify/:target       – send notification to a topic
```

### Outgoing Webhooks — `IWebhookStore`

```ts
import { IWebhookStore, WebhookConfig } from 'awesome-node-auth';

export class MyWebhookStore implements IWebhookStore {
  async findByEvent(event: string, tenantId?: string): Promise<WebhookConfig[]> {
    return db('webhooks')
      .where('isActive', true)
      .where((q) =>
        q.whereNull('tenantId').orWhere('tenantId', tenantId)
      )
      .where((q) =>
        q.whereJsonContains('events', event).orWhereJsonContains('events', '*')
      );
  }
}
```

Each webhook is delivered with optional **HMAC-SHA256 signing** and **exponential back-off retry**:

```ts
// WebhookConfig fields
{
  id: 'wh_1',
  url: 'https://yourapp.com/hooks',
  events: ['identity.auth.login.success', 'identity.user.created'],
  secret: 'your-hmac-secret',    // optional — sets X-Webhook-Signature
  maxRetries: 3,                  // optional — default 3
  retryDelayMs: 1000,             // optional — default 1000 ms (doubles each retry)
  tenantId: 'acme',               // optional — omit for global webhooks
}
```

Verify inbound signatures:

```ts
import { WebhookSender } from 'awesome-node-auth';

const sender = new WebhookSender();
const isValid = sender.verify(rawBody, process.env.WEBHOOK_SECRET!, req.headers['x-webhook-signature']!);
if (!isValid) return res.status(401).send('Invalid signature');
```

### Inbound Webhooks — static callback

```
POST /tools/webhook/:provider
```

```ts
app.use('/tools', createToolsRouter(tools, {
  onWebhook: async (provider, body, req) => {
    if (provider === 'stripe') {
      const event = body as { type: string; data: unknown };
      if (event.type === 'customer.subscription.deleted') {
        return {
          event: 'identity.tenant.user.removed',
          data: event.data,
          tenantId: (body as { metadata?: { tenantId?: string } }).metadata?.tenantId,
        };
      }
    }
    return null; // ignore unknown events
  },
}));
```

### Inbound Webhooks — dynamic vm sandbox

The **governance-driven** approach lets admins configure scripts and permitted actions directly from the Admin UI — no redeploy required.

**Architecture:**

```
External → POST /tools/webhook/:provider
              │
              ▼ webhookStore.findByProvider(provider)
         WebhookConfig { jsScript, allowedActions }
              │
              ▼ settingsStore.getSettings()
         { enabledWebhookActions }
              │
              ▼ intersection (security filter)
         actions { id → fn }   ← only globally-enabled AND per-webhook-allowed
              │
              ▼ vm.runInContext(jsScript, { body, actions, result:null })
         result = { event, data }
              │
              ▼ tools.track(event, data)
         AuthEventBus → telemetry / SSE / outgoing webhooks
```

**Step 1 — expose service methods as injectable actions:**

```ts
import { webhookAction, ActionRegistry } from 'awesome-node-auth';

class SubscriptionService {
  @webhookAction({
    id:          'subscription.cancel',
    label:       'Cancel subscription',
    category:    'Billing',
    description: 'Marks a subscription as cancelled in the database.',
  })
  async cancel(subscriptionId: string): Promise<void> { /* … */ }

  @webhookAction({
    id:          'subscription.notifyUser',
    label:       'Notify user',
    category:    'Billing',
    description: 'Sends a cancellation email to the user.',
    dependsOn:   ['subscription.cancel'],  // only available when cancel is also enabled
  })
  async notifyUser(userId: string): Promise<void> { /* … */ }
}

// Bind the instance so the vm sandbox can call it
const svc = new SubscriptionService();
ActionRegistry.register({ id: 'subscription.cancel',     label: 'Cancel subscription', category: 'Billing', description: '', fn: svc.cancel.bind(svc) });
ActionRegistry.register({ id: 'subscription.notifyUser', label: 'Notify user',          category: 'Billing', description: '', dependsOn: ['subscription.cancel'], fn: svc.notifyUser.bind(svc) });
```

**Step 2 — wire stores into the tools router:**

```ts
app.use('/tools', createToolsRouter(tools, {
  webhookStore:  myWebhookStore,   // must implement findByProvider()
  settingsStore: mySettingsStore,  // reads enabledWebhookActions
}));
```

**Step 3 — configure via Admin UI:**
- **Control tab → Webhook Actions**: toggle which actions are globally enabled.
- **Webhooks tab → Register webhook → Inbound (dynamic)**: assign `provider`, `allowedActions`, and `jsScript`.

**Example script:**
```js
// body = inbound request payload, actions = permitted functions
if (body.type === 'customer.subscription.deleted') {
  await actions['subscription.cancel'](body.data.object.id);
  result = { event: 'identity.tenant.user.removed', data: body.data };
}
```

**Governance rules:**

| Rule | Behaviour |
|------|-----------|
| Action not in `enabledWebhookActions` | Excluded from sandbox |
| Action's `dependsOn` not enabled | Excluded from sandbox |
| Script throws / timeout (5 s) | Logged, HTTP 200 returned |
| `result` is null | Silently acknowledged |

**New API surface:**

```ts
// ActionRegistry — module-level singleton
ActionRegistry.register(entry)           // register a bound function
ActionRegistry.getAllMeta()              // returns metadata (no fn) for the Admin UI
ActionRegistry.buildContext(enabledIds, allowedIds)  // build the sandbox actions object

// WebhookConfig new fields
provider?:       string      // matches :provider param
allowedActions?: string[]    // per-webhook allowed action IDs
jsScript?:       string      // JS executed in vm sandbox

// IWebhookStore new method
findByProvider?(provider: string): Promise<WebhookConfig | null>

// AuthSettings new field
enabledWebhookActions?: string[]  // globally enabled action IDs

// ToolsRouterOptions new options
webhookStore?:  IWebhookStore
settingsStore?: ISettingsStore
```

### Tools Router — all endpoints

| Method | Path | Feature flag | Description |
|--------|------|-------------|-------------|
| `POST` | `/tools/track/:eventName` | `telemetry: true` | Track an event |
| `GET`  | `/tools/telemetry` | `telemetry: true` + `store.query` | Query persisted events |
| `POST` | `/tools/notify/:target` | `notify: true` | Push SSE notification to topic |
| `GET`  | `/tools/stream` | `stream: true` | SSE subscription stream |
| `POST` | `/tools/webhook/:provider` | `webhook: true` + `onWebhook` or `webhookStore.findByProvider` | Receive inbound webhooks |
| `GET`  | `/tools/openapi.json` | `swagger` enabled | OpenAPI 3.0 spec (JSON) |
| `GET`  | `/tools/docs` | `swagger` enabled | Swagger UI (interactive docs) |

Selectively disable endpoints:

```ts
createToolsRouter(tools, {
  telemetry: true,
  notify: true,
  stream: true,
  webhook: false,  // disable inbound webhooks
  authMiddleware: auth.middleware(),
});
```

### Swagger / OpenAPI documentation

Every router ships with a self-contained, **zero-dependency** Swagger UI and OpenAPI 3.0 spec that is enabled by default outside production and disabled in production.  Each router serves its own scoped spec that only documents the features that are actually enabled.

#### Enabling per router

```ts
import { createAuthRouter, createAdminRouter, createToolsRouter } from 'awesome-node-auth';

// Auth router
app.use('/auth', createAuthRouter(store, config, {
  swagger: 'auto',          // 'auto' (default) | true | false
  swaggerBasePath: '/auth', // must match the mount path
}));

// Admin router
app.use('/admin', createAdminRouter(store, {
  adminSecret: process.env.ADMIN_SECRET!,
  swagger: 'auto',
  swaggerBasePath: '/admin',
}));

// Tools router
app.use('/tools', createToolsRouter(tools, {
  swagger: 'auto',
  swaggerBasePath: '/tools',
}));
```

#### Available endpoints

| Router | Swagger UI | OpenAPI spec |
|--------|-----------|-------------|
| Auth (`/auth`) | `GET /auth/docs` | `GET /auth/openapi.json` |
| Admin (`/admin`) | `GET /admin/api/docs` | `GET /admin/api/openapi.json` |
| Tools (`/tools`) | `GET /tools/docs` | `GET /tools/openapi.json` |

The spec is generated dynamically from the same feature flags used to configure the router — disabled routes are omitted from the spec automatically.

#### Programmatic spec generation

All spec builders are exported for CI validation or custom hosting:

```ts
import {
  buildAuthOpenApiSpec,
  buildAdminOpenApiSpec,
  buildOpenApiSpec,    // tools
} from 'awesome-node-auth';

// Auth spec
const authSpec = buildAuthOpenApiSpec(
  { register: true, magicLink: true, totp: true, sms: false, oauth: true },
  '/auth',
);

// Admin spec
const adminSpec = buildAdminOpenApiSpec(
  { sessions: true, roles: true, tenants: false, metadata: true, settings: true },
  '/admin',
);

// Tools spec
const toolsSpec = buildOpenApiSpec(
  { telemetry: true, notify: true, stream: true, webhook: false },
  '/tools',
);

console.log(JSON.stringify(authSpec, null, 2));
```

## API Key / Service Token (Optional)

The library includes an optional **machine-to-machine (M2M) authentication plugin** that allows external systems to authenticate without a user session — ideal for webhooks, backend-to-backend calls, SDK servers, automation jobs, and access to technical endpoints such as `/tools/*`.

An API key does **not** represent a human user identity; it represents a **service identity** with optional scope restrictions.

### Architecture overview

```
Incoming request (Authorization: ApiKey <key> or X-Api-Key: <key>)
       ↓
createApiKeyMiddleware(store, options)
       ↓
ApiKeyStrategy
  ├── extract prefix → store.findByPrefix()
  ├── bcrypt verify  (always runs — timing-attack mitigation)
  ├── isActive check → revocation
  ├── expiresAt check → expiry
  ├── IP allowlist check (CIDR or exact match, optional)
  ├── scope check (optional)
  └── store.updateLastUsed() + store.logUsage() (optional audit log)
       ↓
req.apiKey = { keyId, keyPrefix, name, serviceId, scopes }
```

### Security model

| Property | Implementation |
|----------|----------------|
| Hashed storage | bcrypt — raw key returned once, never stored |
| Timing-attack mitigation | bcrypt always runs even when no record is found |
| Revocation | `isActive: false` — effective immediately |
| Expiry | Optional `expiresAt` |
| IP allowlist | Exact IPv4/IPv6 or CIDR notation; IPv4-mapped IPv6 supported |
| Scope control | `requiredScopes` per middleware instance |
| Audit log | Optional `store.logUsage()` after every attempt (success and failure) |
| Key prefix index | First 11 chars (`ak_` + 8 hex) used for fast store lookup |

### Implementing IApiKeyStore

```ts
import { IApiKeyStore, ApiKey, ApiKeyAuditEntry } from 'awesome-node-auth';

export class MyApiKeyStore implements IApiKeyStore {
  async save(key: ApiKey): Promise<void> {
    await db('api_keys').insert(key);
  }

  // Only return active keys; prefix is used as the lookup index.
  async findByPrefix(prefix: string): Promise<ApiKey | null> {
    return db('api_keys').where({ keyPrefix: prefix, isActive: true }).first() ?? null;
  }

  async findById(id: string): Promise<ApiKey | null> {
    return db('api_keys').where({ id }).first() ?? null;
  }

  async revoke(id: string): Promise<void> {
    await db('api_keys').where({ id }).update({ isActive: false });
  }

  async updateLastUsed(id: string, at?: Date): Promise<void> {
    await db('api_keys').where({ id }).update({ lastUsedAt: at ?? new Date() });
  }

  // Optional — needed only for admin listing or audit trails
  async logUsage(entry: ApiKeyAuditEntry): Promise<void> {
    await db('api_key_audit').insert(entry);
  }
}
```

### Creating a key

```ts
import { ApiKeyService } from 'awesome-node-auth';

const service = new ApiKeyService();

const { rawKey, record } = await service.createKey(myApiKeyStore, {
  name: 'stripe-webhook',         // human-readable label
  serviceId: 'svc-stripe',        // optional: service/tenant identity
  scopes: ['webhooks:receive'],   // optional: permission scopes
  allowedIps: ['54.152.0.0/16'],  // optional: IP allowlist (CIDR or exact)
  expiresAt: new Date('2027-01-01'), // optional: expiry date
});

// ⚠️  Show `rawKey` to the caller exactly once — it cannot be recovered later.
console.log('Your API key:', rawKey);
// record.keyHash is stored in the DB; rawKey is not.
```

Generated keys have the format `ak_<48 hex characters>` (~196 bits of entropy).

### Protecting routes

```ts
import { createApiKeyMiddleware } from 'awesome-node-auth';

// Basic — any valid, active key is accepted
app.use('/tools', createApiKeyMiddleware(myApiKeyStore));

// With required scopes
app.use('/tools/webhook', createApiKeyMiddleware(myApiKeyStore, {
  requiredScopes: ['webhooks:receive'],
}));

// With audit logging
app.use('/tools', createApiKeyMiddleware(myApiKeyStore, {
  auditLog: true,   // calls store.logUsage() after every attempt
}));

// Disable IP allowlist enforcement (not recommended for production)
app.use('/internal', createApiKeyMiddleware(myApiKeyStore, {
  enforceIpAllowlist: false,
}));
```

### Accessing the key context

After a successful authentication the validated context is available on `req.apiKey`:

```ts
app.get('/tools/data', createApiKeyMiddleware(myApiKeyStore), (req, res) => {
  const { keyId, keyPrefix, name, serviceId, scopes } = req.apiKey!;
  res.json({ ok: true, service: name, scopes });
});
```

### Accepted header formats

Both formats are supported and checked in order:

```
Authorization: ApiKey ak_a1b2c3d4...
X-Api-Key: ak_a1b2c3d4...
```

### Rotating a key

Key rotation is a two-step process managed by the application:

```ts
// 1. Create a new key
const { rawKey: newRaw, record: newRecord } = await service.createKey(store, {
  name: 'stripe-webhook-v2',
  scopes: ['webhooks:receive'],
});

// 2. Distribute newRaw to the consumer, then revoke the old key
await store.revoke(oldKeyId);
```

### Error responses

| HTTP | Code | Cause |
|------|------|-------|
| 401 | `API_KEY_MISSING` | No `Authorization: ApiKey` or `X-Api-Key` header |
| 401 | `API_KEY_INVALID` | Key not found or hash mismatch |
| 401 | `API_KEY_REVOKED` | Key exists but `isActive = false` |
| 401 | `API_KEY_EXPIRED` | Key's `expiresAt` is in the past |
| 403 | `API_KEY_IP_BLOCKED` | Client IP not in the key's `allowedIps` list |
| 403 | `API_KEY_INSUFFICIENT_SCOPE` | Key does not have all `requiredScopes` |

### Multi-tenant isolation

* Every event carries an optional `tenantId`.
* SSE connections are scoped to a tenant — a user in tenant `acme` cannot receive events from tenant `globex`.
* Webhooks can be global or scoped to a single tenant via `WebhookConfig.tenantId`.
* `ITelemetryStore.query` receives `tenantId` so the store can partition records accordingly.

## Building

```bash
npm run build
```

## Testing

```bash
npm test
npm run test:coverage
```

## Architecture

```
src/
├── interfaces/          # IUserStore, ITokenStore, IAuthStrategy,
│                        # IUserMetadataStore, IRolesPermissionsStore,
│                        # ISessionStore, ITenantStore,
│                        # ITelemetryStore, IWebhookStore, IApiKeyStore
├── models/              # BaseUser, TokenPair, AuthConfig, AuthError,
│                        # SessionInfo, Tenant, ApiKey
├── abstract/            # BaseAuthStrategy, BaseOAuthStrategy
├── strategies/          # Local, Google, GitHub, MagicLink, SMS, TOTP, ApiKey
├── services/            # TokenService, PasswordService, SmsService, MailerService,
│                        # ApiKeyService
├── middleware/          # createAuthMiddleware(), createApiKeyMiddleware()
├── events/              # AuthEventBus, AuthEventNames
├── tools/               # AuthTools, SseManager, WebhookSender
├── router/              # createAuthRouter() – auth endpoints
│                        # createAdminRouter() – admin panel UI + REST API
│                        # createToolsRouter() – event-driven tools endpoints
│                        # openapi.ts – buildAuthOpenApiSpec, buildAdminOpenApiSpec,
│                        #              buildOpenApiSpec, buildSwaggerUiHtml
└── auth-configurator.ts # Main entry point
```

## Comparison with SuperTokens

The table below maps SuperTokens recipes to awesome-node-auth equivalents so you can evaluate feature coverage for your project.

| SuperTokens Feature | awesome-node-auth equivalent | Notes |
|---------------------|---------------------|-------|
| EmailPassword recipe | `LocalStrategy` + `POST /auth/login` | Full email/password auth with bcrypt |
| ThirdParty / OAuth | `GoogleStrategy`, `GithubStrategy`, `GenericOAuthStrategy` | Extend abstract strategies for any provider |
| Passwordless (magic link) | `MagicLinkStrategy` | Email token via built-in mailer or callback; first login counts as email verification |
| Passwordless (OTP via SMS) | `SmsStrategy` | SMS code via configurable HTTP endpoint |
| TOTP 2FA | `TotpStrategy` | Authenticator-app compatible; QR code included; also enforced for OAuth logins |
| Session management | `ISessionStore` _(optional)_ | Device-aware sessions; list & revoke |
| Session cleanup | `POST /auth/sessions/cleanup` | Cron-callable endpoint; requires `deleteExpiredSessions` |
| User Roles | `IRolesPermissionsStore` _(optional)_ | Full RBAC with tenant scoping |
| User Metadata | `IUserMetadataStore` _(optional)_ | Arbitrary key/value store per user |
| Multi-tenancy | `ITenantStore` _(optional)_ | Tenant CRUD + user membership |
| Custom JWT claims | `buildTokenPayload` callback | Inject any data into access & refresh tokens |
| Database agnostic | `IUserStore` interface | One interface, any DB |
| Rate limiting | `rateLimiter` option in `router()` | Pass any Express middleware |
| CSRF protection | `csrf.enabled` in `AuthConfig` | Double-submit cookie pattern |
| Email verification | `POST /send-verification-email` + `GET /verify-email` | Three modes: `none` / `lazy` (deadline-based, grace period configurable in admin) / `strict` |
| Change password | `POST /change-password` | Authenticated; verifies current password |
| Change email | `POST /change-email/request` + `POST /change-email/confirm` | Verification to new address, notification to old |
| Admin dashboard UI | `createAdminRouter()` | Self-contained UI + REST API, Bearer-token protected; email policy + 2FA policy controls |
| User registration | `POST /auth/register` _(optional)_ | Enabled via `onRegister` callback in `RouterOptions` |
| Rich profile endpoint | `GET /auth/me` | Returns name, provider, roles, permissions, metadata |
| Account linking | `ILinkedAccountsStore` + `GET/DELETE /linked-accounts` | Multiple OAuth providers per user, user can view and unlink; safe without email-based takeover |
| Attack protection | _(not built-in)_ | Use `rateLimiter` + external WAF |
| Telemetry & event tracking | `AuthTools.track()` + `ITelemetryStore` | Optional; emits on `AuthEventBus`; forwards to SSE + webhooks |
| Real-time SSE notifications | `SseManager` + `GET /tools/stream` | Topic-based channels; tenant-isolated; auto-reconnect |
| Outgoing webhooks | `WebhookSender` + `IWebhookStore` | HMAC signing, exponential back-off retry |
| Inbound webhooks | `POST /tools/webhook/:provider` | Anti-replay; maps to internal events |
| Standard event names | `AuthEventNames` | `identity.auth.login.success`, … |
| OpenAPI / Swagger docs | `GET /auth/docs`, `GET /admin/api/docs`, `GET /tools/docs` | Auto-generated per router from enabled features; disabled in production by default |
| API Key / M2M auth | `createApiKeyMiddleware()` + `ApiKeyService` + `IApiKeyStore` | Hashed keys, IP allowlist, scopes, expiry, revocation, audit log |

> **Roadmap ideas:** SCIM provisioning, passkey (WebAuthn) support.

## License

MIT
