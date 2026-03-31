# awesome-node-auth

![npm version](https://img.shields.io/npm/v/awesome-node-auth)
![license](https://img.shields.io/github/license/nik2208/awesome-node-auth)
![github stars](https://img.shields.io/github/stars/nik2208/awesome-node-auth)
[![](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=%23fe8e86)](https://github.com/sponsors/nik2208)

[![NPM](https://nodei.co/npm/awesome-node-auth.png?downloads=true&downloadRank=true)](https://nodei.co/npm/awesome-node-auth/)

A production-ready, **database-agnostic** JWT authentication library for Node.js written in TypeScript. Drop-in auth for Express, NestJS, Next.js, Fastify and any other Node.js framework — connect to any database through a single interface.

> **The self-hosted alternative to Supertokens and Supabase Auth.** Same enterprise-grade features, zero vendor lock-in.

---

## Installation

```bash
npm install awesome-node-auth
```

## Quick Start

```typescript
import express from 'express';
import { AuthConfigurator } from 'awesome-node-auth';
import { myUserStore } from './my-user-store'; // your IUserStore impl

const app = express();
app.use(express.json());

const auth = new AuthConfigurator(
  {
    accessTokenSecret: process.env.ACCESS_TOKEN_SECRET!,
    refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET!,
    accessTokenExpiresIn: '15m',
    refreshTokenExpiresIn: '7d',
  },
  myUserStore,
);

app.use('/auth', auth.router());  // mounts all auth endpoints

app.get('/protected', auth.middleware(), (req, res) => {
  res.json({ user: req.user });
});

app.listen(3000);
```

Implement `IUserStore` once for your database and you're done.  
Full DB examples (MongoDB, PostgreSQL, MySQL, in-memory) → [README.detailed.md](./README.detailed.md).

---

## Features

| Area | Highlights |
|---|---|
| **Auth strategies** | Email/password · OAuth 2.0 (Google, GitHub, custom) · Magic links · SMS OTP · TOTP 2FA |
| **Token management** | HttpOnly-cookie or Bearer mode · automatic access/refresh rotation · `__Host-`/`__Secure-` cookie prefixes |
| **Stateful sessions** *(v1.5)* | `ISessionStore` + real-time revocation (`checkOn: allcalls\|refresh\|none`) · L1/L2 caching decorators |
| **Dynamic email templates** *(v1.6)* | `ITemplateStore` — per-language mail templates + UI i18n with safe hardcoded fallback · built-in `MemoryTemplateStore` |
| **CSRF protection** | Double-submit cookie pattern · `__Host-` prefix hardening against cookie-tossing |
| **Account management** | Registration · change email/password · account deletion · email verification (none/lazy/strict) |
| **Account linking** | Link multiple OAuth providers · conflict resolution via `IPendingLinkStore` |
| **RBAC** | `IRolesPermissionsStore` with tenant awareness |
| **Multi-tenancy** | `ITenantStore` for isolated tenant apps |
| **Admin panel** | Full-featured admin UI: user management, sessions, roles, tenants, metadata, API keys, webhooks |
| **Built-in UI** | Zero-dependency HTML/CSS/JS login UI served at `<apiPrefix>/ui/` · **headless mode** for SPAs |
| **Angular library** | `ng-awesome-node-auth` — interceptor with refresh queue, SESSION_REVOKED loop protection, `getActiveSessions()` |
| **Event-driven** | `AuthEventBus` · SSE push · inbound/outbound webhooks · telemetry |
| **API keys** | M2M bcrypt-hashed keys with scopes, expiry, IP allowlist and audit log |
| **OpenAPI / Swagger** | Auto-generated specs for auth, admin and tools routers |
| **MCP server** | `awesome-node-auth-mcp-server` — Cursor/VS Code integration for code generation |

---

## Key Endpoints

```
POST   /auth/login              POST /auth/refresh           GET  /auth/me
POST   /auth/register           POST /auth/logout            GET  /auth/sessions        ← device list
POST   /auth/forgot-password    POST /auth/change-password   DELETE /auth/sessions/:h   ← revoke device
POST   /auth/magic-link/send    POST /auth/2fa/verify        DELETE /auth/account
GET    /auth/oauth/:provider    GET  /auth/oauth/:provider/callback
POST   /auth/sessions/cleanup   POST /auth/add-phone         PATCH /auth/profile
```

---

## Optional Stores Snapshot

```typescript
const auth = new AuthConfigurator(config, userStore, {
  sessionStore,      // ISessionStore       — stateful sessions + device management
  metadataStore,     // IUserMetadataStore  — arbitrary per-user key/value pairs
  rbacStore,         // IRolesPermissionsStore
  tenantStore,       // ITenantStore
  pendingLinkStore,  // IPendingLinkStore   — OAuth account-linking conflicts
  templateStore,     // ITemplateStore      — dynamic email templates + UI i18n (v1.6)
});
```

Full configuration reference → [README.detailed.md § Configuration](./README.detailed.md#configuration)

---

## Documentation

| Resource | Link |
|---|---|
| **Full reference** | [README.detailed.md](./README.detailed.md) |
| **Wiki / Guides** | [awesomenodeauth.com](https://awesomenodeauth.com) |
| **Changelog** | [CHANGELOG.md](./CHANGELOG.md) |
| **MCP server** | [mcp-server/README.md](https://www.awesomenodeauth.com/docs/mcp-server/) |
| **Demo apps** | [demo/](./demo) |
| **Framework examples** | [examples/](./examples) |

---

## License

[MIT](./LICENSE) · © 2026 nik2208 · [Sponsor ❤](https://github.com/sponsors/nik2208)
