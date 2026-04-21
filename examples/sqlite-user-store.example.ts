/**
 * SqliteUserStore — example IUserStore implementation using better-sqlite3.
 *
 * Installation:
 *   npm install better-sqlite3
 *   npm install --save-dev @types/better-sqlite3
 *
 * Usage:
 *   import Database from 'better-sqlite3';
 *   import { SqliteUserStore, SqliteLinkedAccountsStore, SqliteSettingsStore, SqliteTemplateStore } from './sqlite-user-store.example';
 *
 *   const db = new Database('app.db');
 *   const userStore = new SqliteUserStore(db);
 *   const linkedAccountsStore = new SqliteLinkedAccountsStore(db);
 *   const settingsStore = new SqliteSettingsStore(db);
 *   const templateStore = new SqliteTemplateStore(db);
 *
 * The constructors automatically create the required tables if they do not exist.
 *
 * Also exports:
 *  - SqliteLinkedAccountsStore — ILinkedAccountsStore for flexible OAuth account linking
 *  - SqliteSettingsStore       — ISettingsStore for global auth settings (admin panel)
 *  - SqliteTemplateStore       — ITemplateStore for custom email templates + UI i18n (admin panel)
 */

// NOTE: This file is intentionally NOT compiled by tsconfig.json (it lives in
// examples/, which is excluded). Treat it as reference documentation.
//
// To use it copy it into your own project, install better-sqlite3, and adapt
// the table schema to your needs.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { IUserStore, BaseUser, ILinkedAccountsStore, LinkedAccount, ISettingsStore, AuthSettings, ITemplateStore, MailTemplate, UiTranslation } from '../src/index';

interface DbUser {
  id: string;
  email: string;
  password: string | null;
  role: string | null;
  refresh_token: string | null;
  refresh_token_expiry: string | null;  // ISO string
  reset_token: string | null;
  reset_token_expiry: string | null;
  totp_secret: string | null;
  is_totp_enabled: number;              // SQLite stores booleans as 0/1
  magic_link_token: string | null;
  magic_link_token_expiry: string | null;
  sms_code: string | null;
  sms_code_expiry: string | null;
  phone_number: string | null;
  login_provider: string | null;
  provider_account_id: string | null;
  is_email_verified: number;
  email_verification_token: string | null;
  email_verification_token_expiry: string | null;  // ISO string
  email_verification_deadline: string | null;  // ISO string
  require_2fa: number;                         // 0 or 1
  pending_email: string | null;
  email_change_token: string | null;
  email_change_token_expiry: string | null;    // ISO string
  account_link_token: string | null;
  account_link_token_expiry: string | null;    // ISO string
  account_link_pending_email: string | null;
  account_link_pending_provider: string | null;
}

function toBaseUser(row: DbUser): BaseUser {
  return {
    id: row.id,
    email: row.email,
    password: row.password ?? undefined,
    role: row.role ?? undefined,
    refreshToken: row.refresh_token,
    refreshTokenExpiry: row.refresh_token_expiry ? new Date(row.refresh_token_expiry) : null,
    resetToken: row.reset_token,
    resetTokenExpiry: row.reset_token_expiry ? new Date(row.reset_token_expiry) : null,
    totpSecret: row.totp_secret,
    isTotpEnabled: row.is_totp_enabled === 1,
    magicLinkToken: row.magic_link_token,
    magicLinkTokenExpiry: row.magic_link_token_expiry ? new Date(row.magic_link_token_expiry) : null,
    smsCode: row.sms_code,
    smsCodeExpiry: row.sms_code_expiry ? new Date(row.sms_code_expiry) : null,
    phoneNumber: row.phone_number,
    loginProvider: row.login_provider,
    providerAccountId: row.provider_account_id,
    isEmailVerified: row.is_email_verified === 1,
    emailVerificationToken: row.email_verification_token,
    emailVerificationTokenExpiry: row.email_verification_token_expiry ? new Date(row.email_verification_token_expiry) : null,
    emailVerificationDeadline: row.email_verification_deadline ? new Date(row.email_verification_deadline) : null,
    require2FA: row.require_2fa === 1,
    pendingEmail: row.pending_email,
    emailChangeToken: row.email_change_token,
    emailChangeTokenExpiry: row.email_change_token_expiry ? new Date(row.email_change_token_expiry) : null,
    accountLinkToken: row.account_link_token,
    accountLinkTokenExpiry: row.account_link_token_expiry ? new Date(row.account_link_token_expiry) : null,
    accountLinkPendingEmail: row.account_link_pending_email,
    accountLinkPendingProvider: row.account_link_pending_provider,
  };
}

export class SqliteUserStore implements IUserStore {
  constructor(private readonly db: any /* Database from better-sqlite3 */) {
    this.createTable();
  }

  // ---- Setup -----------------------------------------------------------

  private createTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id                               TEXT PRIMARY KEY,
        email                            TEXT UNIQUE NOT NULL,
        password                         TEXT,
        role                             TEXT DEFAULT 'user',
        refresh_token                    TEXT,
        refresh_token_expiry             TEXT,
        reset_token                      TEXT,
        reset_token_expiry               TEXT,
        totp_secret                      TEXT,
        is_totp_enabled                  INTEGER DEFAULT 0,
        magic_link_token                 TEXT,
        magic_link_token_expiry          TEXT,
        sms_code                         TEXT,
        sms_code_expiry                  TEXT,
        phone_number                     TEXT,
        login_provider                   TEXT,
        provider_account_id              TEXT,
        is_email_verified                INTEGER DEFAULT 0,
        email_verification_token         TEXT,
        email_verification_token_expiry  TEXT,
        email_verification_deadline      TEXT,
        require_2fa                      INTEGER DEFAULT 0,
        pending_email                    TEXT,
        email_change_token               TEXT,
        email_change_token_expiry        TEXT,
        account_link_token               TEXT,
        account_link_token_expiry        TEXT,
        account_link_pending_email       TEXT,
        account_link_pending_provider    TEXT,
        created_at                       TEXT DEFAULT (datetime('now')),
        updated_at                       TEXT DEFAULT (datetime('now'))
      )
    `);
  }

  // ---- Core CRUD -------------------------------------------------------

  async findByEmail(email: string): Promise<BaseUser | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as DbUser | undefined;
    return row ? toBaseUser(row) : null;
  }

  async findById(id: string): Promise<BaseUser | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as DbUser | undefined;
    return row ? toBaseUser(row) : null;
  }

  async create(data: Partial<BaseUser>): Promise<BaseUser> {
    const id = data.id ?? crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO users (id, email, password, role, login_provider, provider_account_id, is_email_verified, email_verification_deadline, require_2fa)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.email ?? '',
      data.password ?? null,
      data.role ?? 'user',
      data.loginProvider ?? null,
      data.providerAccountId ?? null,
      data.isEmailVerified ? 1 : 0,
      data.emailVerificationDeadline?.toISOString() ?? null,
      data.require2FA ? 1 : 0,
    );
    return (await this.findById(id))!;
  }

  // ---- Token updates ---------------------------------------------------

  async updateRefreshToken(userId: string, token: string | null, expiry: Date | null): Promise<void> {
    this.db.prepare(`
      UPDATE users SET refresh_token = ?, refresh_token_expiry = ?, updated_at = datetime('now') WHERE id = ?
    `).run(token, expiry?.toISOString() ?? null, userId);
  }

  async updateResetToken(userId: string, token: string | null, expiry: Date | null): Promise<void> {
    this.db.prepare(`
      UPDATE users SET reset_token = ?, reset_token_expiry = ?, updated_at = datetime('now') WHERE id = ?
    `).run(token, expiry?.toISOString() ?? null, userId);
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    this.db.prepare(`
      UPDATE users SET password = ?, updated_at = datetime('now') WHERE id = ?
    `).run(hashedPassword, userId);
  }

  async updateTotpSecret(userId: string, secret: string | null): Promise<void> {
    this.db.prepare(`
      UPDATE users SET totp_secret = ?, is_totp_enabled = ?, updated_at = datetime('now') WHERE id = ?
    `).run(secret, secret !== null ? 1 : 0, userId);
  }

  async updateMagicLinkToken(userId: string, token: string | null, expiry: Date | null): Promise<void> {
    this.db.prepare(`
      UPDATE users SET magic_link_token = ?, magic_link_token_expiry = ?, updated_at = datetime('now') WHERE id = ?
    `).run(token, expiry?.toISOString() ?? null, userId);
  }

  async updateSmsCode(userId: string, code: string | null, expiry: Date | null): Promise<void> {
    this.db.prepare(`
      UPDATE users SET sms_code = ?, sms_code_expiry = ?, updated_at = datetime('now') WHERE id = ?
    `).run(code, expiry?.toISOString() ?? null, userId);
  }

  // ---- Optional look-ups (needed for reset-password & magic-link) ------

  async findByResetToken(token: string): Promise<BaseUser | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE reset_token = ?').get(token) as DbUser | undefined;
    return row ? toBaseUser(row) : null;
  }

  async findByMagicLinkToken(token: string): Promise<BaseUser | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE magic_link_token = ?').get(token) as DbUser | undefined;
    return row ? toBaseUser(row) : null;
  }

  // ---- Email verification ----------------------------------------------

  async updateEmailVerificationToken(userId: string, token: string | null, expiry: Date | null): Promise<void> {
    this.db.prepare(`
      UPDATE users SET email_verification_token = ?, email_verification_token_expiry = ?, updated_at = datetime('now') WHERE id = ?
    `).run(token, expiry?.toISOString() ?? null, userId);
  }

  async updateEmailVerified(userId: string, isVerified: boolean): Promise<void> {
    this.db.prepare(`
      UPDATE users SET is_email_verified = ?, updated_at = datetime('now') WHERE id = ?
    `).run(isVerified ? 1 : 0, userId);
  }

  async findByEmailVerificationToken(token: string): Promise<BaseUser | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE email_verification_token = ?').get(token) as DbUser | undefined;
    return row ? toBaseUser(row) : null;
  }

  // ---- Change email ----------------------------------------------------

  async updateEmailChangeToken(userId: string, pendingEmail: string | null, token: string | null, expiry: Date | null): Promise<void> {
    this.db.prepare(`
      UPDATE users SET pending_email = ?, email_change_token = ?, email_change_token_expiry = ?, updated_at = datetime('now') WHERE id = ?
    `).run(pendingEmail, token, expiry?.toISOString() ?? null, userId);
  }

  async updateEmail(userId: string, newEmail: string): Promise<void> {
    this.db.prepare(`
      UPDATE users SET email = ?, pending_email = NULL, email_change_token = NULL, email_change_token_expiry = NULL, updated_at = datetime('now') WHERE id = ?
    `).run(newEmail, userId);
  }

  async findByEmailChangeToken(token: string): Promise<BaseUser | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE email_change_token = ?').get(token) as DbUser | undefined;
    return row ? toBaseUser(row) : null;
  }

  // ---- Account linking -------------------------------------------------

  async updateAccountLinkToken(
    userId: string,
    pendingEmail: string | null,
    pendingProvider: string | null,
    token: string | null,
    expiry: Date | null,
  ): Promise<void> {
    this.db.prepare(`
      UPDATE users SET account_link_pending_email = ?, account_link_pending_provider = ?,
        account_link_token = ?, account_link_token_expiry = ?, updated_at = datetime('now') WHERE id = ?
    `).run(pendingEmail, pendingProvider, token, expiry?.toISOString() ?? null, userId);
  }

  async findByAccountLinkToken(token: string): Promise<BaseUser | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE account_link_token = ?').get(token) as DbUser | undefined;
    return row ? toBaseUser(row) : null;
  }

  // ---- OAuth provider lookup -------------------------------------------

  async findByProviderAccount(provider: string, providerAccountId: string): Promise<BaseUser | null> {
    const row = this.db.prepare(
      'SELECT * FROM users WHERE login_provider = ? AND provider_account_id = ?'
    ).get(provider, providerAccountId) as DbUser | undefined;
    return row ? toBaseUser(row) : null;
  }

  // ---- 2FA policy ------------------------------------------------------

  async updateRequire2FA(userId: string, required: boolean): Promise<void> {
    this.db.prepare(`
      UPDATE users SET require_2fa = ?, updated_at = datetime('now') WHERE id = ?
    `).run(required ? 1 : 0, userId);
  }

  // ---- Admin listing ---------------------------------------------------

  async listUsers(limit: number, offset: number): Promise<BaseUser[]> {
    const rows = this.db.prepare('SELECT * FROM users LIMIT ? OFFSET ?').all(limit, offset) as DbUser[];
    return rows.map(toBaseUser);
  }

  async deleteUser(userId: string): Promise<void> {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }
}

// ---------------------------------------------------------------------------
// SqliteLinkedAccountsStore
// ---------------------------------------------------------------------------

/**
 * SQLite ILinkedAccountsStore — stores linked OAuth accounts per user.
 *
 * Enables the following endpoints when passed to createAuthRouter:
 *   GET  /auth/linked-accounts
 *   DELETE /auth/linked-accounts/:provider/:providerAccountId
 *   POST /auth/link-request  (requires updateAccountLinkToken on IUserStore)
 *   POST /auth/link-verify   (requires findByAccountLinkToken on IUserStore)
 */
export class SqliteLinkedAccountsStore implements ILinkedAccountsStore {
  constructor(private readonly db: any /* Database from better-sqlite3 */) {
    this.createTable();
  }

  private createTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS linked_accounts (
        user_id             TEXT NOT NULL,
        provider            TEXT NOT NULL,
        provider_account_id TEXT NOT NULL,
        email               TEXT,
        name                TEXT,
        picture             TEXT,
        linked_at           TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, provider, provider_account_id)
      )
    `);
  }

  async getLinkedAccounts(userId: string): Promise<LinkedAccount[]> {
    const rows = this.db.prepare('SELECT * FROM linked_accounts WHERE user_id = ?').all(userId) as any[];
    return rows.map(r => ({
      provider: r.provider,
      providerAccountId: r.provider_account_id,
      email: r.email ?? undefined,
      name: r.name ?? undefined,
      picture: r.picture ?? undefined,
      linkedAt: r.linked_at ? new Date(r.linked_at) : undefined,
    }));
  }

  async linkAccount(userId: string, account: LinkedAccount): Promise<void> {
    this.db.prepare(`
      INSERT OR REPLACE INTO linked_accounts (user_id, provider, provider_account_id, email, name, picture, linked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      account.provider,
      account.providerAccountId,
      account.email ?? null,
      account.name ?? null,
      account.picture ?? null,
      account.linkedAt?.toISOString() ?? new Date().toISOString(),
    );
  }

  async unlinkAccount(userId: string, provider: string, providerAccountId: string): Promise<void> {
    this.db.prepare(
      'DELETE FROM linked_accounts WHERE user_id = ? AND provider = ? AND provider_account_id = ?'
    ).run(userId, provider, providerAccountId);
  }

  async findUserByProviderAccount(provider: string, providerAccountId: string): Promise<{ userId: string } | null> {
    const row = this.db.prepare(
      'SELECT user_id FROM linked_accounts WHERE provider = ? AND provider_account_id = ?'
    ).get(provider, providerAccountId) as { user_id: string } | undefined;
    return row ? { userId: row.user_id } : null;
  }
}

// ---------------------------------------------------------------------------
// SqliteSettingsStore
// ---------------------------------------------------------------------------

/**
 * SQLite ISettingsStore — persists global auth settings for the admin
 * Control panel (email verification policy, mandatory 2FA toggle, etc.).
 */
export class SqliteSettingsStore implements ISettingsStore {
  constructor(private readonly db: any /* Database from better-sqlite3 */) {
    this.createTable();
  }

  private createTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS auth_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  }

  async getSettings(): Promise<AuthSettings> {
    const rows = this.db.prepare('SELECT key, value FROM auth_settings').all() as { key: string; value: string }[];
    const obj: Record<string, unknown> = {};
    for (const { key, value } of rows) {
      try { obj[key] = JSON.parse(value); } catch { obj[key] = value; }
    }
    return obj as AuthSettings;
  }

  async updateSettings(updates: Partial<AuthSettings>): Promise<void> {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO auth_settings (key, value) VALUES (?, ?)'
    );
    for (const [key, value] of Object.entries(updates)) {
      stmt.run(key, JSON.stringify(value));
    }
  }
}

// ---------------------------------------------------------------------------
// SqliteTemplateStore
// ---------------------------------------------------------------------------

/**
 * SQLite ITemplateStore — persists custom email templates and UI i18n strings
 * for the admin panel Email & UI Templates tab.
 *
 * Two tables are used:
 *   mail_templates  — one row per template ID
 *   ui_translations — one row per page ID
 *
 * Usage:
 *   const templateStore = new SqliteTemplateStore(db);
 *
 *   // Wire to AuthConfigurator so MailerService uses stored templates:
 *   const auth = new AuthConfigurator({ ...authConfig, templateStore }, userStore);
 *
 *   // Wire to buildUiRouter so stored UI translations are injected at render time:
 *   app.use('/auth/ui', buildUiRouter({ authConfig, templateStore, ... }));
 *
 *   // Wire to createAdminRouter to enable the 📧 Email & UI Templates tab:
 *   app.use('/admin', createAdminRouter(userStore, {
 *     accessPolicy: 'first-user',
 *     jwtSecret,
 *     templateStore,
 *   }));
 */
export class SqliteTemplateStore implements ITemplateStore {
  constructor(private readonly db: any /* Database from better-sqlite3 */) {
    this.createTables();
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mail_templates (
        id           TEXT NOT NULL PRIMARY KEY,
        base_html    TEXT NOT NULL DEFAULT '',
        base_text    TEXT NOT NULL DEFAULT '',
        translations TEXT NOT NULL DEFAULT '{}'
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ui_translations (
        page         TEXT NOT NULL PRIMARY KEY,
        translations TEXT NOT NULL DEFAULT '{}'
      )
    `);
  }

  // ---- Mail templates -------------------------------------------------------

  async getMailTemplate(id: string): Promise<MailTemplate | null> {
    const row = this.db
      .prepare('SELECT id, base_html, base_text, translations FROM mail_templates WHERE id = ?')
      .get(id) as { id: string; base_html: string; base_text: string; translations: string } | undefined;
    if (!row) return null;
    return {
      id:           row.id,
      baseHtml:     row.base_html ?? '',
      baseText:     row.base_text ?? '',
      translations: JSON.parse(row.translations ?? '{}'),
    };
  }

  async listMailTemplates(): Promise<MailTemplate[]> {
    const rows = this.db
      .prepare('SELECT id, base_html, base_text, translations FROM mail_templates')
      .all() as { id: string; base_html: string; base_text: string; translations: string }[];
    return rows.map(row => ({
      id:           row.id,
      baseHtml:     row.base_html ?? '',
      baseText:     row.base_text ?? '',
      translations: JSON.parse(row.translations ?? '{}'),
    }));
  }

  async updateMailTemplate(id: string, template: Partial<MailTemplate>): Promise<void> {
    const existing = await this.getMailTemplate(id);
    const merged: MailTemplate = {
      id,
      baseHtml:     template.baseHtml     ?? existing?.baseHtml     ?? '',
      baseText:     template.baseText     ?? existing?.baseText     ?? '',
      translations: template.translations ?? existing?.translations ?? {},
    };
    this.db
      .prepare(`
        INSERT OR REPLACE INTO mail_templates (id, base_html, base_text, translations)
        VALUES (?, ?, ?, ?)
      `)
      .run(merged.id, merged.baseHtml, merged.baseText, JSON.stringify(merged.translations));
  }

  // ---- UI translations ------------------------------------------------------

  async getUiTranslations(page: string): Promise<UiTranslation | null> {
    const row = this.db
      .prepare('SELECT page, translations FROM ui_translations WHERE page = ?')
      .get(page) as { page: string; translations: string } | undefined;
    if (!row) return null;
    return {
      page:         row.page,
      translations: JSON.parse(row.translations ?? '{}'),
    };
  }

  async listUiTranslations(): Promise<UiTranslation[]> {
    const rows = this.db
      .prepare('SELECT page, translations FROM ui_translations')
      .all() as { page: string; translations: string }[];
    return rows.map(row => ({
      page:         row.page,
      translations: JSON.parse(row.translations ?? '{}'),
    }));
  }

  async updateUiTranslations(
    page: string,
    translations: Record<string, Record<string, string>>,
  ): Promise<void> {
    this.db
      .prepare('INSERT OR REPLACE INTO ui_translations (page, translations) VALUES (?, ?)')
      .run(page, JSON.stringify(translations));
  }
}
