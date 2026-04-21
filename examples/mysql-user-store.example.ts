/**
 * MySqlUserStore — example IUserStore implementation using mysql2 (MySQL / MariaDB).
 *
 * Installation:
 *   npm install mysql2
 *
 * Usage:
 *   import mysql from 'mysql2/promise';
 *   import { MySqlUserStore, MySqlLinkedAccountsStore, MySqlSettingsStore, MySqlTemplateStore } from './mysql-user-store.example';
 *
 *   const pool = mysql.createPool({ … });
 *   const userStore = new MySqlUserStore(pool);
 *   const linkedAccountsStore = new MySqlLinkedAccountsStore(pool);
 *   const settingsStore = new MySqlSettingsStore(pool);
 *   const templateStore = new MySqlTemplateStore(pool);
 *   await userStore.init();
 *   await linkedAccountsStore.init();
 *   await settingsStore.init();
 *   await templateStore.init();
 *
 * NOTE: This file is intentionally NOT compiled by tsconfig.json (it lives in
 * examples/, which is excluded). Treat it as reference documentation.
 *
 * Also exports:
 *  - MySqlLinkedAccountsStore — ILinkedAccountsStore for flexible OAuth account linking
 *  - MySqlSettingsStore       — ISettingsStore for global auth settings (admin panel)
 *  - MySqlTemplateStore       — ITemplateStore for custom email templates + UI i18n (admin panel)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { IUserStore, BaseUser, ILinkedAccountsStore, LinkedAccount, ISettingsStore, AuthSettings, ITemplateStore, MailTemplate, UiTranslation } from '../src/index';

// ---- MySQL row shape (snake_case columns) ---------------------------------

interface DbUser {
  id: string;
  email: string;
  password: string | null;
  role: string | null;
  refresh_token: string | null;
  refresh_token_expiry: Date | null;
  reset_token: string | null;
  reset_token_expiry: Date | null;
  totp_secret: string | null;
  is_totp_enabled: number;   // MySQL TINYINT – 0 or 1
  magic_link_token: string | null;
  magic_link_token_expiry: Date | null;
  sms_code: string | null;
  sms_code_expiry: Date | null;
  phone_number: string | null;
  login_provider: string | null;
  provider_account_id: string | null;
  is_email_verified: number;
  email_verification_token: string | null;
  email_verification_token_expiry: Date | null;
  email_verification_deadline: Date | null;
  require_2fa: number;   // MySQL TINYINT – 0 or 1
  pending_email: string | null;
  email_change_token: string | null;
  email_change_token_expiry: Date | null;
  account_link_token: string | null;
  account_link_token_expiry: Date | null;
  account_link_pending_email: string | null;
  account_link_pending_provider: string | null;
}

// ---- Mapper ---------------------------------------------------------------

function toBaseUser(row: DbUser): BaseUser {
  return {
    id: row.id,
    email: row.email,
    password: row.password ?? undefined,
    role: row.role ?? undefined,
    refreshToken: row.refresh_token,
    refreshTokenExpiry: row.refresh_token_expiry ?? null,
    resetToken: row.reset_token,
    resetTokenExpiry: row.reset_token_expiry ?? null,
    totpSecret: row.totp_secret,
    isTotpEnabled: row.is_totp_enabled === 1,
    magicLinkToken: row.magic_link_token,
    magicLinkTokenExpiry: row.magic_link_token_expiry ?? null,
    smsCode: row.sms_code,
    smsCodeExpiry: row.sms_code_expiry ?? null,
    phoneNumber: row.phone_number,
    loginProvider: row.login_provider,
    providerAccountId: row.provider_account_id,
    isEmailVerified: row.is_email_verified === 1,
    emailVerificationToken: row.email_verification_token,
    emailVerificationTokenExpiry: row.email_verification_token_expiry ?? null,
    emailVerificationDeadline: row.email_verification_deadline ?? null,
    require2FA: row.require_2fa === 1,
    pendingEmail: row.pending_email,
    emailChangeToken: row.email_change_token,
    emailChangeTokenExpiry: row.email_change_token_expiry ?? null,
    accountLinkToken: row.account_link_token,
    accountLinkTokenExpiry: row.account_link_token_expiry ?? null,
    accountLinkPendingEmail: row.account_link_pending_email,
    accountLinkPendingProvider: row.account_link_pending_provider,
  };
}

// ---- Store ----------------------------------------------------------------

export class MySqlUserStore implements IUserStore {
  /**
   * @param pool  A mysql2 Pool or Connection created with `mysql2/promise`.
   *              Accepts `Pool | PoolConnection | Connection` – anything that
   *              exposes an `execute()` method returning `[rows, fields]`.
   */
  constructor(private readonly pool: any /* mysql2 Pool */) { }

  // ---- Setup ---------------------------------------------------------------

  /** Call once at application start to create the users table if absent. */
  async init(): Promise<void> {
    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id                               VARCHAR(36)  NOT NULL PRIMARY KEY,
        email                            VARCHAR(255) NOT NULL UNIQUE,
        password                         VARCHAR(255),
        role                             VARCHAR(50)  DEFAULT 'user',
        refresh_token                    TEXT,
        refresh_token_expiry             DATETIME,
        reset_token                      VARCHAR(255),
        reset_token_expiry               DATETIME,
        totp_secret                      VARCHAR(255),
        is_totp_enabled                  TINYINT(1)   DEFAULT 0,
        magic_link_token                 VARCHAR(255),
        magic_link_token_expiry          DATETIME,
        sms_code                         VARCHAR(10),
        sms_code_expiry                  DATETIME,
        phone_number                     VARCHAR(30),
        login_provider                   VARCHAR(50),
        provider_account_id              VARCHAR(255),
        is_email_verified                TINYINT(1)   DEFAULT 0,
        email_verification_token         VARCHAR(255),
        email_verification_token_expiry  DATETIME,
        email_verification_deadline      DATETIME,
        require_2fa                      TINYINT(1)   DEFAULT 0,
        pending_email                    VARCHAR(255),
        email_change_token               VARCHAR(255),
        email_change_token_expiry        DATETIME,
        account_link_token               VARCHAR(255),
        account_link_token_expiry        DATETIME,
        account_link_pending_email       VARCHAR(255),
        account_link_pending_provider    VARCHAR(50),
        created_at                       DATETIME     DEFAULT CURRENT_TIMESTAMP,
        updated_at                       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_provider (login_provider, provider_account_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  // ---- Core CRUD -----------------------------------------------------------

  async findByEmail(email: string): Promise<BaseUser | null> {
    const [rows] = await this.pool.execute(
      'SELECT * FROM users WHERE email = ? LIMIT 1',
      [email],
    );
    const row = (rows as DbUser[])[0];
    return row ? toBaseUser(row) : null;
  }

  async findById(id: string): Promise<BaseUser | null> {
    const [rows] = await this.pool.execute(
      'SELECT * FROM users WHERE id = ? LIMIT 1',
      [id],
    );
    const row = (rows as DbUser[])[0];
    return row ? toBaseUser(row) : null;
  }

  async create(data: Partial<BaseUser>): Promise<BaseUser> {
    const id = data.id ?? crypto.randomUUID();
    await this.pool.execute(
      `INSERT INTO users (id, email, password, role, login_provider, provider_account_id, is_email_verified, email_verification_deadline, require_2fa)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.email ?? '',
        data.password ?? null,
        data.role ?? 'user',
        data.loginProvider ?? null,
        data.providerAccountId ?? null,
        data.isEmailVerified ? 1 : 0,
        data.emailVerificationDeadline ?? null,
        data.require2FA ? 1 : 0,
      ],
    );
    return (await this.findById(id))!;
  }

  // ---- Token updates -------------------------------------------------------

  async updateRefreshToken(userId: string, token: string | null, expiry: Date | null): Promise<void> {
    await this.pool.execute(
      'UPDATE users SET refresh_token = ?, refresh_token_expiry = ? WHERE id = ?',
      [token, expiry ?? null, userId],
    );
  }

  async updateResetToken(userId: string, token: string | null, expiry: Date | null): Promise<void> {
    await this.pool.execute(
      'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?',
      [token, expiry ?? null, userId],
    );
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await this.pool.execute(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, userId],
    );
  }

  async updateTotpSecret(userId: string, secret: string | null): Promise<void> {
    await this.pool.execute(
      'UPDATE users SET totp_secret = ?, is_totp_enabled = ? WHERE id = ?',
      [secret, secret !== null ? 1 : 0, userId],
    );
  }

  async updateMagicLinkToken(userId: string, token: string | null, expiry: Date | null): Promise<void> {
    await this.pool.execute(
      'UPDATE users SET magic_link_token = ?, magic_link_token_expiry = ? WHERE id = ?',
      [token, expiry ?? null, userId],
    );
  }

  async updateSmsCode(userId: string, code: string | null, expiry: Date | null): Promise<void> {
    await this.pool.execute(
      'UPDATE users SET sms_code = ?, sms_code_expiry = ? WHERE id = ?',
      [code, expiry ?? null, userId],
    );
  }

  // ---- Optional look-ups (required for reset-password & magic-link) --------

  async findByResetToken(token: string): Promise<BaseUser | null> {
    const [rows] = await this.pool.execute(
      'SELECT * FROM users WHERE reset_token = ? LIMIT 1',
      [token],
    );
    const row = (rows as DbUser[])[0];
    return row ? toBaseUser(row) : null;
  }

  async findByMagicLinkToken(token: string): Promise<BaseUser | null> {
    const [rows] = await this.pool.execute(
      'SELECT * FROM users WHERE magic_link_token = ? LIMIT 1',
      [token],
    );
    const row = (rows as DbUser[])[0];
    return row ? toBaseUser(row) : null;
  }

  // ---- Email verification --------------------------------------------------

  async updateEmailVerificationToken(userId: string, token: string | null, expiry: Date | null): Promise<void> {
    await this.pool.execute(
      'UPDATE users SET email_verification_token = ?, email_verification_token_expiry = ? WHERE id = ?',
      [token, expiry ?? null, userId],
    );
  }

  async updateEmailVerified(userId: string, isVerified: boolean): Promise<void> {
    await this.pool.execute(
      'UPDATE users SET is_email_verified = ? WHERE id = ?',
      [isVerified ? 1 : 0, userId],
    );
  }

  async findByEmailVerificationToken(token: string): Promise<BaseUser | null> {
    const [rows] = await this.pool.execute(
      'SELECT * FROM users WHERE email_verification_token = ? LIMIT 1',
      [token],
    );
    const row = (rows as DbUser[])[0];
    return row ? toBaseUser(row) : null;
  }

  // ---- Change email --------------------------------------------------------

  async updateEmailChangeToken(userId: string, pendingEmail: string | null, token: string | null, expiry: Date | null): Promise<void> {
    await this.pool.execute(
      'UPDATE users SET pending_email = ?, email_change_token = ?, email_change_token_expiry = ? WHERE id = ?',
      [pendingEmail, token, expiry ?? null, userId],
    );
  }

  async updateEmail(userId: string, newEmail: string): Promise<void> {
    await this.pool.execute(
      'UPDATE users SET email = ?, pending_email = NULL, email_change_token = NULL, email_change_token_expiry = NULL WHERE id = ?',
      [newEmail, userId],
    );
  }

  async findByEmailChangeToken(token: string): Promise<BaseUser | null> {
    const [rows] = await this.pool.execute(
      'SELECT * FROM users WHERE email_change_token = ? LIMIT 1',
      [token],
    );
    const row = (rows as DbUser[])[0];
    return row ? toBaseUser(row) : null;
  }

  // ---- Account linking -----------------------------------------------------

  async updateAccountLinkToken(
    userId: string,
    pendingEmail: string | null,
    pendingProvider: string | null,
    token: string | null,
    expiry: Date | null,
  ): Promise<void> {
    await this.pool.execute(
      'UPDATE users SET account_link_pending_email = ?, account_link_pending_provider = ?, account_link_token = ?, account_link_token_expiry = ? WHERE id = ?',
      [pendingEmail, pendingProvider, token, expiry ?? null, userId],
    );
  }

  async findByAccountLinkToken(token: string): Promise<BaseUser | null> {
    const [rows] = await this.pool.execute(
      'SELECT * FROM users WHERE account_link_token = ? LIMIT 1',
      [token],
    );
    const row = (rows as DbUser[])[0];
    return row ? toBaseUser(row) : null;
  }

  // ---- OAuth provider lookup -----------------------------------------------

  async findByProviderAccount(provider: string, providerAccountId: string): Promise<BaseUser | null> {
    const [rows] = await this.pool.execute(
      'SELECT * FROM users WHERE login_provider = ? AND provider_account_id = ? LIMIT 1',
      [provider, providerAccountId],
    );
    const row = (rows as DbUser[])[0];
    return row ? toBaseUser(row) : null;
  }

  // ---- 2FA policy ----------------------------------------------------------

  async updateRequire2FA(userId: string, required: boolean): Promise<void> {
    await this.pool.execute(
      'UPDATE users SET require_2fa = ? WHERE id = ?',
      [required ? 1 : 0, userId],
    );
  }

  // ---- Admin listing -------------------------------------------------------

  async listUsers(limit: number, offset: number): Promise<BaseUser[]> {
    const [rows] = await this.pool.execute(
      'SELECT * FROM users LIMIT ? OFFSET ?',
      [limit, offset],
    );
    return (rows as DbUser[]).map(toBaseUser);
  }

  async deleteUser(userId: string): Promise<void> {
    await this.pool.execute('DELETE FROM users WHERE id = ?', [userId]);
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.pool.execute('UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [userId]);
  }
}

// ---------------------------------------------------------------------------
// MySqlLinkedAccountsStore
// ---------------------------------------------------------------------------

/**
 * MySQL ILinkedAccountsStore — stores linked OAuth accounts per user.
 *
 * Enables the following endpoints when passed to createAuthRouter:
 *   GET  /auth/linked-accounts
 *   DELETE /auth/linked-accounts/:provider/:providerAccountId
 *   POST /auth/link-request  (requires updateAccountLinkToken on IUserStore)
 *   POST /auth/link-verify   (requires findByAccountLinkToken on IUserStore)
 */
export class MySqlLinkedAccountsStore implements ILinkedAccountsStore {
  constructor(private readonly pool: any /* mysql2 Pool */) { }

  /** Call once at application start to create the table if absent. */
  async init(): Promise<void> {
    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS linked_accounts (
        user_id             VARCHAR(36)  NOT NULL,
        provider            VARCHAR(50)  NOT NULL,
        provider_account_id VARCHAR(255) NOT NULL,
        email               VARCHAR(255),
        name                VARCHAR(255),
        picture             TEXT,
        linked_at           DATETIME     DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, provider, provider_account_id),
        INDEX idx_provider_account (provider, provider_account_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async getLinkedAccounts(userId: string): Promise<LinkedAccount[]> {
    const [rows] = await this.pool.execute(
      'SELECT * FROM linked_accounts WHERE user_id = ?',
      [userId],
    );
    return (rows as any[]).map(r => ({
      provider: r.provider,
      providerAccountId: r.provider_account_id,
      email: r.email ?? undefined,
      name: r.name ?? undefined,
      picture: r.picture ?? undefined,
      linkedAt: r.linked_at ?? undefined,
    }));
  }

  async linkAccount(userId: string, account: LinkedAccount): Promise<void> {
    await this.pool.execute(
      `INSERT INTO linked_accounts (user_id, provider, provider_account_id, email, name, picture, linked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE email = VALUES(email), name = VALUES(name), picture = VALUES(picture), linked_at = VALUES(linked_at)`,
      [
        userId,
        account.provider,
        account.providerAccountId,
        account.email ?? null,
        account.name ?? null,
        account.picture ?? null,
        account.linkedAt ?? new Date(),
      ],
    );
  }

  async unlinkAccount(userId: string, provider: string, providerAccountId: string): Promise<void> {
    await this.pool.execute(
      'DELETE FROM linked_accounts WHERE user_id = ? AND provider = ? AND provider_account_id = ?',
      [userId, provider, providerAccountId],
    );
  }

  async findUserByProviderAccount(provider: string, providerAccountId: string): Promise<{ userId: string } | null> {
    const [rows] = await this.pool.execute(
      'SELECT user_id FROM linked_accounts WHERE provider = ? AND provider_account_id = ? LIMIT 1',
      [provider, providerAccountId],
    );
    const row = (rows as any[])[0];
    return row ? { userId: row.user_id } : null;
  }
}

// ---------------------------------------------------------------------------
// MySqlSettingsStore
// ---------------------------------------------------------------------------

/**
 * MySQL ISettingsStore — persists global auth settings for the admin
 * Control panel (email verification policy, mandatory 2FA toggle, etc.).
 */
export class MySqlSettingsStore implements ISettingsStore {
  constructor(private readonly pool: any /* mysql2 Pool */) { }

  /** Call once at application start to create the table if absent. */
  async init(): Promise<void> {
    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS auth_settings (
        \`key\`   VARCHAR(100) NOT NULL PRIMARY KEY,
        \`value\` TEXT         NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async getSettings(): Promise<AuthSettings> {
    const [rows] = await this.pool.execute('SELECT `key`, `value` FROM auth_settings');
    const obj: Record<string, unknown> = {};
    for (const { key, value } of rows as { key: string; value: string }[]) {
      try { obj[key] = JSON.parse(value); } catch { obj[key] = value; }
    }
    return obj as AuthSettings;
  }

  async updateSettings(updates: Partial<AuthSettings>): Promise<void> {
    for (const [key, value] of Object.entries(updates)) {
      await this.pool.execute(
        'INSERT INTO auth_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
        [key, JSON.stringify(value)],
      );
    }
  }
}

// ---------------------------------------------------------------------------
// MySqlTemplateStore
// ---------------------------------------------------------------------------

/**
 * MySQL ITemplateStore — persists custom email templates and UI i18n strings
 * for the admin panel Email & UI Templates tab.
 *
 * Two tables are used:
 *   mail_templates  — one row per template ID
 *   ui_translations — one row per page ID
 *
 * Usage:
 *   const templateStore = new MySqlTemplateStore(pool);
 *   await templateStore.init();
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
export class MySqlTemplateStore implements ITemplateStore {
  constructor(private readonly pool: any /* mysql2 Pool */) {}

  /** Call once at application start to create the tables if absent. */
  async init(): Promise<void> {
    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS mail_templates (
        id           VARCHAR(100)  NOT NULL PRIMARY KEY,
        base_html    LONGTEXT      NOT NULL,
        base_text    LONGTEXT      NOT NULL,
        translations JSON          NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS ui_translations (
        page         VARCHAR(100)  NOT NULL PRIMARY KEY,
        translations JSON          NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  // ---- Mail templates -------------------------------------------------------

  async getMailTemplate(id: string): Promise<MailTemplate | null> {
    const [rows] = await this.pool.execute(
      'SELECT id, base_html, base_text, translations FROM mail_templates WHERE id = ? LIMIT 1',
      [id],
    );
    const row = (rows as any[])[0];
    if (!row) return null;
    return {
      id:           row.id,
      baseHtml:     row.base_html  ?? '',
      baseText:     row.base_text  ?? '',
      translations: typeof row.translations === 'string' ? JSON.parse(row.translations) : (row.translations ?? {}),
    };
  }

  async listMailTemplates(): Promise<MailTemplate[]> {
    const [rows] = await this.pool.execute(
      'SELECT id, base_html, base_text, translations FROM mail_templates',
    );
    return (rows as any[]).map(row => ({
      id:           row.id,
      baseHtml:     row.base_html  ?? '',
      baseText:     row.base_text  ?? '',
      translations: typeof row.translations === 'string' ? JSON.parse(row.translations) : (row.translations ?? {}),
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
    await this.pool.execute(
      `INSERT INTO mail_templates (id, base_html, base_text, translations)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE base_html = VALUES(base_html), base_text = VALUES(base_text), translations = VALUES(translations)`,
      [merged.id, merged.baseHtml, merged.baseText, JSON.stringify(merged.translations)],
    );
  }

  // ---- UI translations ------------------------------------------------------

  async getUiTranslations(page: string): Promise<UiTranslation | null> {
    const [rows] = await this.pool.execute(
      'SELECT page, translations FROM ui_translations WHERE page = ? LIMIT 1',
      [page],
    );
    const row = (rows as any[])[0];
    if (!row) return null;
    return {
      page:         row.page,
      translations: typeof row.translations === 'string' ? JSON.parse(row.translations) : (row.translations ?? {}),
    };
  }

  async listUiTranslations(): Promise<UiTranslation[]> {
    const [rows] = await this.pool.execute('SELECT page, translations FROM ui_translations');
    return (rows as any[]).map(row => ({
      page:         row.page,
      translations: typeof row.translations === 'string' ? JSON.parse(row.translations) : (row.translations ?? {}),
    }));
  }

  async updateUiTranslations(
    page: string,
    translations: Record<string, Record<string, string>>,
  ): Promise<void> {
    await this.pool.execute(
      `INSERT INTO ui_translations (page, translations)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE translations = VALUES(translations)`,
      [page, JSON.stringify(translations)],
    );
  }
}
