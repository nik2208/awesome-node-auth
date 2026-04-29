# Changelog

All notable changes to **awesome-node-auth** are documented in this file.  
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) · Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.9.0] — 2026-04-29

### Added

#### Identity Provider (IdP) mode — RS256 + JWKS
- **`idProvider` config block** — enables RS256-signed JWTs and exposes a public JWKS endpoint (`GET /.well-known/jwks.json` by default). When `privateKey` is omitted an ephemeral RSA-2048 keypair is auto-generated at startup (dev only).
- **`resourceServer` config block** — turns any instance into a downstream Resource Server that validates Bearer tokens via JWKS without sharing secrets.
- **`JwksService`** static class — `generateKeypair()`, `derivePublicKey()`, `publicKeyToJwk()`, `buildJwksDocument()`, `jwkToPublicKey()`, `createRemoteClient()`; all using Node.js built-in `crypto`.
- **`JwksClient`** — cached JWKS fetching with stale-while-revalidate TTL, `getKey(kid)` lookup, and automatic cache invalidation on unknown `kid` for seamless key rotation.
- **`createJwksAuthMiddleware()`** — auth middleware for Resource Servers: Bearer → JWKS RS256 validation; cookie fallback → local HS256 for SSR dashboard pages.
- **`TokenService.generateIdProviderTokenPair()`** — issues RS256-signed access **and** refresh tokens with `iss` claim and `kid` JOSE header parameter (RFC 7515 §4.1.4).
- **`TokenService.verifyWithJwks()`** — validates a token via `JwksClient`, enforces issuer, retries with cache invalidation on key rotation.
- **`IdProviderConfig` / `ResourceServerConfig`** interfaces — exported from the main entry point.
- **New exports**: `JwksService`, `JwksClient`, `JWK`, `JwksDocument`, `JwksClientOptions`, `createJwksAuthMiddleware`, `IdProviderConfig`, `ResourceServerConfig`.
- **26 new tests** — `tests/jwks.service.test.ts` (18) and `tests/jwks-auth.middleware.test.ts` (8) covering the full IdP/RS surface.
- **Zero new npm dependencies** — implemented entirely with Node.js built-in `crypto` and `https` modules.

> **Spec note:** `kid` is a JOSE header parameter (RFC 7515 §4.1.4), not a JWT payload claim. Both access and refresh tokens are RS256-signed in IdP mode to prevent HS256 downgrade attacks on the refresh flow.

#### Flutter client support
- **`awesome-node-auth-flutter`** package support added to MCP server docs, tools, and prompts — guides agents through integrating the Dart/Flutter client with a node-auth backend.

#### MCP server — v1.9.0 updates
- **`setup-idp-mode` prompt** — guides agents through Provisioner and/or Resource Server setup, keypair generation, JWKS verification, and the full docker-compose scaffold.
- **`scaffold_idp_project` tool** — generates a ready-to-run Provisioner + Resource Server skeleton (or both with a shared `docker-compose.yml` and `.env.example`).
- **`docs.ts` resource** — new IdP mode section covering `IdProviderConfig`, `ResourceServerConfig`, `JwksService` API, `createJwksAuthMiddleware`, key rotation, and production checklist.
- Version fallback in `mcp-server/src/tools/version.ts` bumped to `1.9.0`.

#### Wiki
- **`advanced/idp-mode.md`** — new page covering architecture, config reference, token signing behaviour, JWKS endpoint, Resource Server validation, key rotation, and security checklist.
- `sidebars.ts` updated to include `advanced/idp-mode`.
- `advanced/index.md` table updated with IdP Mode row.
- `wiki/package.json` bumped to `1.9.0`.

---

## [1.8.4] - 2026-04-18

### Fixed
- **Admin panel — Email & UI Templates tab (silent failures)**: the template catalogue in the admin UI listed `email-verification` (non-existent) and the spurious `otp` ID while omitting `welcome` and `email-changed`. Customisations appeared saved but were never applied because `MailerService` looks up different IDs. All six IDs (`magic-link`, `password-reset`, `verify-email`, `welcome`, `email-changed`, `invitation`) now match `MailerService.render()` exactly.
- **Admin panel — UI translations pages list drift**: `sms-login` (no HTML file) and `common` (not queried by the UI router) have been removed; `magic-link`, `link-verify`, and `account-conflict` have been added. Each page now carries its exact `data-i18n` keys extracted from the corresponding HTML file.
- **Admin panel — CSS classes missing**: all class names referenced by the Templates tab JavaScript (`template-grid`, `template-list`, `template-item`, `template-editor-*`, `template-preview-*`, `template-vars`, `template-var-chip`, `translation-grid`, `translation-lang-*`) are now defined in `admin.css`.
- **`MailerService.render()`**: templates stored with empty `baseHtml` or `baseText` (e.g. after pressing "Reset to default" in the admin panel) now correctly fall back to the built-in template instead of rendering an empty email.

### Added
- **Admin panel — Live preview**: the template editor now renders a sandboxed `<iframe srcdoc>` preview in real time, interpolating `{{VAR}}` and `{{T.key}}` with labelled sample values. The subject line is displayed above the preview. `sandbox=""` prevents scripts, forms, and navigation entirely.
- **Admin panel — Translations key/value grid**: the raw JSON textarea for translations has been replaced with a per-language tab + key/value grid. Languages and keys can be added/removed without touching JSON. Shared by both the email template and UI translations editors.
- **Admin panel — Click-to-insert variable chips**: each template exposes its `{{VAR}}` and `{{T.key}}` placeholders as clickable chips; clicking one inserts it at the cursor position in the focused textarea.
- **Admin panel — Reset to default button**: clears `baseHtml`, `baseText`, and `translations` in the store so `MailerService` falls back to its built-in template.
- **`scripts/extract-i18n-keys.js`**: new build script that reads every HTML page in `src/ui/assets/` and writes `src/ui/assets/ui-i18n-keys.json` — a static map of `page → data-i18n keys`. Run via `npm run extract-i18n` (also executed automatically during `npm run build`).

---


## [1.8.3] — 2026-04-02

### Fixed
- **Admin UI JS** — fixed a regression where the Admin UI was not rendering the admin panel

---

## [1.8.2] — 2026-04-01

### Added
- **Self-Contained Admin Authentication** — the Admin UI now handles its own login and logout via internal `POST /admin/login` and `POST /admin/logout` routes. This removes dependencies on the main application's auth router, making the Admin Panel truly autonomous.
- **Root/Bootstrap User Support** — added `AdminOptions.rootUser` (email + password hash) for permanent emergency access.
- **Bootstrap Mode** — if `adminSecret` is configured, the Admin login form allows password-only access (leaving email blank).
- **Dynamic Cookie Prefix Detection** — the admin guard now automatically detects and handles secure cookie prefixes (`__Host-`, `__Secure-`) based on the environment and `AdminOptions.cookiePrefix`.

### Fixed
- **Admin UI Logout** — fixed a regression where the logout button would attempt to call the main auth API instead of the local admin logout handler.
- **Cookie Prefix Conflicts** — resolved issues where admin sessions were not persisted correctly when running behind a proxy or in production with secure cookies.

---

## [1.8.1] — 2026-04-01

### Added
- **Built-in Admin Login Fallback** — the Admin UI now includes a native login form (Email + Password) that appears when a user is not authenticated. This allows the Admin Panel to function in "zero-config" mode for headless or SPA-only projects without requiring a custom login path.

### Changed
- **`AuthRequestHandler` return type** — relaxed from `void | Promise<void>` to `any`. This improves compatibility with many common third-party Express middlewares (like `express-rate-limit`) that may return `unknown` or non-standard types.
- **Admin Security Enforcement** — `accessPolicy` and `jwtSecret` are now strictly required in `createAdminRouter`.
- **MCP Server Templates** — updated all code generators to use the standard `AuthConfigurator` and `createAdminRouter` patterns, removing dependencies on deprecated factory functions.
- **`.env.example`** — removed `AUTH_ADMIN_SECRET` and added `ADMIN_LOGIN_PATH` documentation.

### Fixed
- **TypeScript Error 2322** in `mcp-server` and other integration points where `RateLimitRequestHandler` was not assignable to `AuthRequestHandler`.
- **Angular SSR Template** — removed defunct `createNodeAuth` factory and restored manual setup in MCP scaffolding.

### Removed
- **`adminSecret` support** — the deprecated static password has been fully removed in favor of the session-based `accessPolicy`.

---

## [1.8.0] — 2026-03-30

### Added
- **`NotificationService`** (`src/services/notification.service.ts`) — lightweight facade
  wrapping `MailerService` and `SmsService`; accepts `email` and `sms` config independently
  so notification capabilities can be passed to `AuthTools` without exposing the full `AuthConfig`.
- **Multi-channel `notify()`** — `AuthTools.notify()` is now `async` and accepts an optional
  `channels?: ('sse' | 'email' | 'sms')[]` array in `NotifyOptions`.  Email and SMS channels
  require `userStore`, `emailConfig`/`smsConfig` in `AuthToolsOptions` respectively.
  Defaults to `['sse']` — fully backward-compatible.
- **`AdminAccessPolicy`** type — `'first-user' | 'is-admin-flag' | 'open' | (user, rbacStore?) => boolean`;
  exported from the main package entry point.
- **Session-based Admin UI guard** — new `buildPolicyGuard()` middleware validates the app JWT
  and evaluates `accessPolicy`.  Unauthenticated browser requests are redirected automatically to
  `/auth/ui/login?redirect=<adminPath>` (302); API requests receive 401.
- **`BaseUser.isAdmin?: boolean`** — convenience flag used by the `'is-admin-flag'` policy.
- **`MailerService.sendCustom()`** — sends arbitrary business emails using the configured mailer
  transport (subject, HTML, plain-text).
- **`AuthToolsOptions.userStore?`** — optional `IUserStore` for resolving contact details in
  multi-channel notify.
- **`AuthToolsOptions.emailConfig?`** / **`AuthToolsOptions.smsConfig?`** — transport configs
  for email/SMS notification channels; accept the same shape as `MailerConfig` / `SmsConfig`.

### Changed
- `AdminOptions.adminSecret` is now **optional** and **deprecated**.  The field remains fully
  functional for backward compatibility but will be removed in a future major version.
  Migrate to `accessPolicy` + `jwtSecret` as described in the Admin Panel guide.
- `AdminOptions` now exposes `accessPolicy?: AdminAccessPolicy` and `jwtSecret?: string`.
- Admin HTML (`buildAdminHtml`) omits the secret-input login screen when `accessPolicy` is set
  (`sessionBased: true`); the server-side guard handles authentication before serving the page.
- MCP code generators (`backend.ts`, `scaffold.ts`, `test-generator.ts`) now emit
  `accessPolicy: 'first-user'` + `jwtSecret` instead of `adminSecret` + `ADMIN_SECRET`.
- `env-generator.ts` no longer emits an `ADMIN_SECRET` variable; replaced with a comment
  explaining that session-based auth is used.
- `mcp-server/src/resources/docs.ts` and `prompts/index.ts` updated to document the new
  access policy system and remove `ADMIN_SECRET` instructions.
- `wiki/docs/advanced/admin.md` rewritten: auth-flow diagram updated, setup examples use
  `accessPolicy`/`jwtSecret`, migration tip added.
- `wiki/docs/advanced/auth-tools.md` updated: `notify()` section extended with email/SMS
  channel examples and configuration.

### Fixed
- Admin router no longer warns about missing `adminSecret` when `accessPolicy` is provided.

---

## [1.7.0] — 2026-03-30

### Added
- **Framework-agnostic HTTP types** (`src/http-types.ts`) — `AuthRequest`, `AuthResponse`,
  `AuthNextFunction`, `AuthRequestHandler`, `AuthRouter` interfaces with zero framework
  dependencies, exported from the main package entry point.
- **Express adapter** (`src/adapters/express.ts`) — `expressAdapter()` zero-overhead cast
  from `AuthRequestHandler` to Express `RequestHandler`; re-exports `Router`, `RequestHandler`,
  `Request`, `Response`, `NextFunction` from Express for convenience.
- **Fastify adapter** (`src/adapters/fastify.ts`) — `fastifyAdapter()` wraps an
  `AuthRequestHandler` as a Fastify `preHandler` hook via `req.raw` / `reply.raw`;
  no extra dependencies required.
- **`awesome-node-auth://guides/framework-agnostic`** MCP resource — guide covering Express,
  NestJS, Next.js App Router, and custom adapter patterns.
- **`examples/fastify-integration.example.ts`** — reference Fastify integration showing
  middleware-only, full-router (`@fastify/express`), and manual token-service patterns.

### Changed
- `RouterOptions.rateLimiter` now typed as `AuthRequestHandler` instead of `RequestHandler`
  (Express `RequestHandler` remains directly assignable — no breaking change).
- `AuthRequestHandler` JSDoc extended with `@example`, `@since 1.7.0`, and a full
  explanation of the TypeScript contravariance reason for using `any` parameters.
- `examples/nestjs-integration.example.ts` updated: `JwtAuthGuard` and `CurrentUser`
  decorator now use the framework-neutral `AuthRequest` type instead of `import { Request }
  from 'express'`.

### Fixed
- MCP server: corrected stale endpoint names across `docs.ts`, `prompts/index.ts`,
  `test-generator.ts` (`/magic-link/request` → `/magic-link/send`, `2fa/login` → `2fa/verify`,
  `sms/request` → `sms/send`).
- `wiki/docs/frameworks/framework-agnostic.md`: replaced inaccurate "Express `RequestHandler`
  is structurally assignable to `AuthRequestHandler`" with a technically-correct contravariance
  explanation.

---

## [1.6.0] — 2026-03-21

### Added
- **`ITemplateStore`** — optional interface for dynamic, per-language email templates and UI i18n, with a built-in `MemoryTemplateStore` in-memory implementation.
- **Dynamic email templates** — `MailerService` now resolves templates through the store before falling back to the built-in en/it templates; supports `{{T.key}}` translation interpolation and `{{VAR}}` data interpolation in subject, HTML and plain-text bodies.
- **UI i18n** — `buildUiRouter` accepts an optional `templateStore`; `auth.js` `applyTranslations()` patches `data-i18n` elements at runtime while keeping the original hardcoded text as a safe fallback when no translation is found.
- **Admin "Email & UI" tab** — `createAdminRouter` activates a new template-editor tab (mail templates + UI translations) only when a `templateStore` is provided; REST endpoints `GET/POST /admin/api/templates/mail` and `GET/POST /admin/api/templates/ui`.

### Changed
- `AuthConfig.templateStore?: ITemplateStore` and `AdminOptions.templateStore?: ITemplateStore` added as optional fields (fully backward-compatible).
- `MailerService` constructor now accepts an optional `templateStore` as a second argument.

---

## [1.5.1] — 2026-03-19

### Fixed
- Fixed admin ui height

---

## [1.5.0] — 2026-03-18

### Added
- **Hybrid Stateful Sessions** (`ISessionStore`) — optional server-side session tracking layered on top of JWT, enabling real-time revocation without invalidating all tokens.
- **Session validation modes** — `session.checkOn: 'none' | 'refresh' | 'allcalls'`; `allcalls` validates the session on every authenticated request via the auth middleware.
- **User-facing session endpoints** — `GET /auth/sessions` (list own devices) and `DELETE /auth/sessions/:handle` (revoke a device), both guarded by auth middleware and ownership check.
- **Atomic session rotation** — on `POST /auth/refresh` the old session handle is revoked and a new one is issued atomically; the `sid` claim in the JWT tracks the handle.
- **L1/L2 caching helpers** — `RedisSessionStore` (L2 Redis-backed) and `L1CachedSessionStore` (in-process LRU decorator) for high-throughput session validation.
- **`SESSION_REVOKED` loop protection** — `auth.js` fetch interceptor and Angular HTTP interceptors now detect `code: 'SESSION_REVOKED'` on a 401 and force an immediate local logout instead of looping through refresh retries.
- **`getActiveSessions()` / `revokeSession(handle)`** in `ng-awesome-node-auth` Angular service for "Manage devices" UI.
- **`SessionInfo` interface** exported from the Angular library.

### Changed
- `auth.middleware` updated to perform real-time session validation when `checkOn: 'allcalls'` is configured.
- JWT payload now includes `sid` (session ID) claim when a `sessionStore` is configured.
- `auth.js` `refresh()` public method returns `false` immediately for `SESSION_REVOKED` responses.

### Fixed
- Infinite refresh loop: `refreshResult.success !== false` incorrectly treated `{code:'SESSION_REVOKED'}` (no `success` field) as a successful refresh.
- Session expiry now reads `session.expiresIn` from `AuthConfig` rather than defaulting to a hard-coded 7-day value.

---

## [1.4.2] — 2026-03-17

### Fixed
- `__Host-` cookies require `Path=/` per the RFC; the refresh-token cookie path was incorrect under certain route prefixes, causing browsers to reject it.
- Added integration tests for `__Host-` / `__Secure-` cookie path compliance.

---

## [1.4.1] — 2026-03-17

### Changed
- `auth.js` fetch interceptor switched from path-prefix matching to **origin-based credential matching**, preventing credential leakage to unrelated origins (e.g., a LiteLLM proxy on a different port).

### Fixed
- `auth.js` was inadvertently intercepting requests to third-party origins when running alongside a Docusaurus wiki or AI proxy on the same page.

---

## [1.4.0] — 2026-03-17

### Added
- **Headless UI mode** (`ui.headless: true`) — the built-in UI router serves `auth.js` and CSS assets but returns 404 for HTML pages; ideal for SPAs and wiki integrations that provide their own UI. The `/config` endpoint includes `headless: true` for the client to detect the mode.
- `window.AwesomeNodeAuth` singleton with a public `refresh()` API, exposing token refresh to external scripts without re-entrant loops.

---

## [1.3.0] — 2026-03-14

### Added
- **CSRF cookie-tossing protection** — CSRF cookie now uses `__Host-` prefix (`__Secure-` when `secure` is true but running under a subdomain), preventing subdomain cookie-tossing attacks.
- **`ng-awesome-node-auth` Angular library** — first official Angular integration guide with `AuthService`, `authInterceptor` (CSRF + refresh queue), `APP_INITIALIZER`, and SSR support.
- **Built-in UI documentation** — comprehensive reference for the zero-dependency HTML/CSS/JS login UI.
- **Admin panel platform settings** — configurable per-platform feature flags exposed through the admin UI.
- MCP server tools: `get_mailer_integration`, `get_sms_integration`, `get_ui_customization`, `get_email_templates`, `get_ng_awesome_node_auth`.

### Fixed
- `__Host-` / `__Secure-` CSRF and access-token cookie prefix handling in `auth.js`, Angular interceptors, and MCP server.

---

## [1.2.x] — 2026-03-10 to 2026-03-11

### Added
- **Built-in UI** (`<apiPrefix>/ui/`) — zero-dependency HTML/CSS/JS login, register, forgot-password, and reset-password pages served directly by the library.
- Live preview and full customization of the built-in UI (background color, card color, logo, background image) via the admin panel.
- CSS custom properties (`--auth-bg-color`, `--auth-card-bg`, etc.) for theme overrides.
- Spinner and improved loading states in the built-in login page.
- 87 unit tests for `auth.js` browser client API.
- `window.AwesomeNodeAuth` documented browser client API.

### Fixed
- `refreshToken` path auto-derivation now works correctly relative to `apiPrefix`.
- Admin UI XSS/escape bug in dashboard string interpolation.
- Asset loading and auth routing prefix hierarchy.

---

## [1.1.x] — 2026-02-21 to 2026-03-07

### Added
- **Email verification** — three modes: `none` (disabled), `lazy` (grace period configurable), `strict` (login blocked until verified).
- **Change email** — `PATCH /auth/change-email` with re-verification flow.
- **Change password** — `PATCH /auth/change-password`.
- **Admin panel** — HTML-based admin dashboard at `/admin/` with user listing, filtering, pagination, batch operations, and per-user detail view; tabs for metadata, roles, tenants, linked accounts, API keys, webhooks.
- **User metadata** (`IUserMetadataStore`) — arbitrary per-user key/value store surfaced in `/me` and admin panel.
- **Roles & permissions** (`IRolesPermissionsStore`) — RBAC with optional tenant scope; roles/permissions returned in `/me`.
- **Session management** (`ISessionStore`) — interface for listing and revoking sessions; optional `POST /auth/sessions/cleanup` for cron-based expiry.
- **Multi-tenancy** (`ITenantStore`) — isolated multi-tenant applications with tenant-scoped roles.
- **Account deletion** — `DELETE /auth/account` self-service endpoint with full cleanup hooks.
- **CSRF protection** — double-submit cookie pattern, opt-in via `csrf.enabled`.
- **Bearer token strategy** — `X-Auth-Strategy: bearer` header enables JSON body token delivery instead of HttpOnly cookies.
- **Custom JWT claims** — `buildTokenPayload` callback for injecting project-specific claims.
- **Provider parameter in mailer** — pass the auth provider to email templates.
- `IUserStore.updateLastLogin()` optional method.
- Rate limiter support on `GET /me` and other sensitive endpoints via `RouterOptions.rateLimiter`.
- NestJS, Next.js, MySQL/MariaDB, and MongoDB integration examples in `examples/`.

### Fixed
- Admin dashboard HTML interpolation escaping.
- Refresh token cookie path bug.
- Login verification issues distinguishing SMS/magic-link direct login from 2FA mode.
- `deleteUser` implementation.

---

## [1.0.x] — 2026-02-21

### Added (Initial Release)
- **Core JWT authentication** — access + refresh token pair, HttpOnly cookie delivery.
- **Local strategy** — email/password login with bcrypt hashing.
- **Password reset** — `POST /auth/forgot-password` + `POST /auth/reset-password` with time-limited tokens.
- **OAuth 2.0** — Google and GitHub strategies; `GenericOAuthStrategy` base class for custom providers; `success_redirect_path` in OAuth state.
- **Magic links** — passwordless email login; first magic-link also counts as email verification.
- **SMS OTP** — phone-number verification via one-time codes.
- **TOTP 2FA** — time-based OTP compatible with Google Authenticator / Authy; `require2FA` flag per user.
- **`IUserStore` interface** — single decoupling point to any database.
- **`MailerService`** — HTTP transport mailer with Italian and English templates for password reset, magic links, email verification.
- **Express auth router** — all endpoints pre-wired at a configurable `apiPrefix`.
- **`auth.middleware()`** — JWT verification middleware accepting cookie or `Authorization: Bearer`.
- **`POST /auth/register`** — optional registration endpoint via `onRegister` callback.
- **`GET /auth/me`** — user profile endpoint.
- **Rate limiter hook** — `RouterOptions.rateLimiter` integration point.
- Full TypeScript types and exported interfaces.

---

## Version History Quick Reference

| Version | Date | Theme |
|---|---|---|
| 1.0.x | 2026-02-21 | Initial release — JWT, Local, OAuth, Magic Links, SMS, TOTP |
| 1.1.x | 2026-02-21–03-07 | Email verification, admin panel, metadata, RBAC, multi-tenancy, account mgmt |
| 1.2.x | 2026-03-10–11 | Built-in UI, CSS theming, admin UI customization, browser client tests |
| 1.3.0 | 2026-03-14 | CSRF cookie-tossing protection, Angular library, MCP tools expansion |
| 1.4.x | 2026-03-17 | Headless UI mode, origin-based fetch interceptor, `__Host-` cookie path fix |
| 1.5.0 | 2026-03-18 | Hybrid stateful sessions, device management API, SESSION_REVOKED loop fix |
| 1.6.0 | 2026-03-21 | Dynamic email templates, UI i18n, `ITemplateStore`, admin template editor |
| 1.7.0 | 2026-03-30 | Framework-agnostic HTTP types, Fastify adapter |
| 1.8.x | 2026-03-30–04-18 | Multi-channel notify, session-based admin auth, admin UI improvements |
| 1.9.0 | 2026-04-29 | IdP mode (RS256 + JWKS), Resource Server middleware, Flutter client support |
