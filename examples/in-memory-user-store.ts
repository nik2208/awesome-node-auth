/**
 * InMemoryUserStore — example IUserStore implementation for testing / prototyping.
 *
 * Do NOT use this in production (data is lost on restart).
 * It implements all required AND optional IUserStore methods so that every
 * auth feature (password reset, magic link, TOTP, SMS, OAuth,
 * email verification, change-email, change-password, linked accounts,
 * global settings) works out of the box.
 *
 * Also exports:
 *  - InMemoryLinkedAccountsStore — ILinkedAccountsStore for flexible OAuth account linking
 *  - InMemorySettingsStore       — ISettingsStore for global auth settings (admin panel)
 */

import { IUserStore, BaseUser, ILinkedAccountsStore, LinkedAccount, ISettingsStore, AuthSettings } from '../src/index';

export class InMemoryUserStore implements IUserStore {
  private users = new Map<string, BaseUser>();
  private nextId = 1;

  // ---- Core CRUD -------------------------------------------------------

  async findByEmail(email: string): Promise<BaseUser | null> {
    return [...this.users.values()].find(u => u.email === email) ?? null;
  }

  async findById(id: string): Promise<BaseUser | null> {
    return this.users.get(id) ?? null;
  }

  async create(data: Partial<BaseUser>): Promise<BaseUser> {
    const id = String(this.nextId++);
    const user: BaseUser = { id, email: data.email ?? '', ...data };
    this.users.set(id, user);
    return user;
  }

  // ---- Token updates ---------------------------------------------------

  async updateRefreshToken(userId: string, token: string | null, expiry: Date | null): Promise<void> {
    const u = this.users.get(userId);
    if (u) { u.refreshToken = token; u.refreshTokenExpiry = expiry; }
  }

  async updateLastLogin(userId: string): Promise<void> {
    const u = this.users.get(userId);
    if (u) u.lastLogin = new Date();
  }

  async updateResetToken(userId: string, token: string | null, expiry: Date | null): Promise<void> {
    const u = this.users.get(userId);
    if (u) { u.resetToken = token; u.resetTokenExpiry = expiry; }
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    const u = this.users.get(userId);
    if (u) u.password = hashedPassword;
  }

  async updateTotpSecret(userId: string, secret: string | null): Promise<void> {
    const u = this.users.get(userId);
    if (u) { u.totpSecret = secret; u.isTotpEnabled = secret !== null; }
  }

  async updateMagicLinkToken(userId: string, token: string | null, expiry: Date | null): Promise<void> {
    const u = this.users.get(userId);
    if (u) { u.magicLinkToken = token; u.magicLinkTokenExpiry = expiry; }
  }

  async updateSmsCode(userId: string, code: string | null, expiry: Date | null): Promise<void> {
    const u = this.users.get(userId);
    if (u) { u.smsCode = code; u.smsCodeExpiry = expiry; }
  }

  // ---- Optional look-ups (needed for reset-password & magic-link) ------

  async findByResetToken(token: string): Promise<BaseUser | null> {
    return [...this.users.values()].find(u => u.resetToken === token) ?? null;
  }

  async findByMagicLinkToken(token: string): Promise<BaseUser | null> {
    return [...this.users.values()].find(u => u.magicLinkToken === token) ?? null;
  }

  // ---- Email verification -----------------------------------------------

  async updateEmailVerificationToken(
    userId: string,
    token: string | null,
    expiry: Date | null,
  ): Promise<void> {
    const u = this.users.get(userId);
    if (u) { u.emailVerificationToken = token; u.emailVerificationTokenExpiry = expiry; }
  }

  async updateEmailVerified(userId: string, isVerified: boolean): Promise<void> {
    const u = this.users.get(userId);
    if (u) u.isEmailVerified = isVerified;
  }

  async findByEmailVerificationToken(token: string): Promise<BaseUser | null> {
    return [...this.users.values()].find(u => u.emailVerificationToken === token) ?? null;
  }

  // ---- Change email -----------------------------------------------------

  async updateEmailChangeToken(
    userId: string,
    pendingEmail: string | null,
    token: string | null,
    expiry: Date | null,
  ): Promise<void> {
    const u = this.users.get(userId);
    if (u) {
      u.pendingEmail = pendingEmail;
      u.emailChangeToken = token;
      u.emailChangeTokenExpiry = expiry;
    }
  }

  async updateEmail(userId: string, newEmail: string): Promise<void> {
    const u = this.users.get(userId);
    if (u) {
      u.email = newEmail;
      u.pendingEmail = null;
      u.emailChangeToken = null;
      u.emailChangeTokenExpiry = null;
    }
  }

  async findByEmailChangeToken(token: string): Promise<BaseUser | null> {
    return [...this.users.values()].find(u => u.emailChangeToken === token) ?? null;
  }

  // ---- Account linking -------------------------------------------------

  async updateAccountLinkToken(
    userId: string,
    pendingEmail: string | null,
    pendingProvider: string | null,
    token: string | null,
    expiry: Date | null,
  ): Promise<void> {
    const u = this.users.get(userId);
    if (u) {
      u.accountLinkPendingEmail = pendingEmail;
      u.accountLinkPendingProvider = pendingProvider;
      u.accountLinkToken = token;
      u.accountLinkTokenExpiry = expiry;
    }
  }

  async findByAccountLinkToken(token: string): Promise<BaseUser | null> {
    return [...this.users.values()].find(u => u.accountLinkToken === token) ?? null;
  }

  // ---- OAuth provider lookup --------------------------------------------

  async findByProviderAccount(provider: string, providerAccountId: string): Promise<BaseUser | null> {
    return [...this.users.values()].find(
      u => u.loginProvider === provider && u.providerAccountId === providerAccountId
    ) ?? null;
  }

  // ---- 2FA policy -------------------------------------------------------

  async updateRequire2FA(userId: string, required: boolean): Promise<void> {
    const u = this.users.get(userId);
    if (u) u.require2FA = required;
  }

  // ---- Admin listing ---------------------------------------------------

  async listUsers(limit: number, offset: number): Promise<BaseUser[]> {
    return [...this.users.values()].slice(offset, offset + limit);
  }

  /** Remove a user entirely (used by the admin DELETE /users/:id endpoint). */
  async deleteUser(userId: string): Promise<void> {
    this.users.delete(userId);
  }
}

// ---------------------------------------------------------------------------
// InMemoryLinkedAccountsStore
// ---------------------------------------------------------------------------

/**
 * In-memory ILinkedAccountsStore — stores linked OAuth accounts per user.
 *
 * Enables the following endpoints when passed to createAuthRouter:
 *   GET  /auth/linked-accounts
 *   DELETE /auth/linked-accounts/:provider/:providerAccountId
 *   POST /auth/link-request  (requires updateAccountLinkToken on IUserStore)
 *   POST /auth/link-verify   (requires findByAccountLinkToken on IUserStore)
 *
 * Usage:
 *   const linkedAccountsStore = new InMemoryLinkedAccountsStore();
 *   app.use('/auth', createAuthRouter(userStore, config, { linkedAccountsStore }));
 */
export class InMemoryLinkedAccountsStore implements ILinkedAccountsStore {
  /** userId → list of linked accounts */
  private links = new Map<string, LinkedAccount[]>();

  async getLinkedAccounts(userId: string): Promise<LinkedAccount[]> {
    return this.links.get(userId) ?? [];
  }

  async linkAccount(userId: string, account: LinkedAccount): Promise<void> {
    const existing = this.links.get(userId) ?? [];
    // Idempotent: replace if same (provider, providerAccountId)
    const idx = existing.findIndex(
      a => a.provider === account.provider && a.providerAccountId === account.providerAccountId
    );
    if (idx >= 0) {
      existing[idx] = account;
    } else {
      existing.push(account);
    }
    this.links.set(userId, existing);
  }

  async unlinkAccount(userId: string, provider: string, providerAccountId: string): Promise<void> {
    const existing = this.links.get(userId) ?? [];
    this.links.set(
      userId,
      existing.filter(a => !(a.provider === provider && a.providerAccountId === providerAccountId)),
    );
  }

  async findUserByProviderAccount(
    provider: string,
    providerAccountId: string,
  ): Promise<{ userId: string } | null> {
    for (const [userId, accounts] of this.links.entries()) {
      if (accounts.some(a => a.provider === provider && a.providerAccountId === providerAccountId)) {
        return { userId };
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// InMemorySettingsStore
// ---------------------------------------------------------------------------

/**
 * In-memory ISettingsStore — persists global auth settings for the admin
 * Control panel (email verification policy, mandatory 2FA toggle, etc.).
 *
 * Usage:
 *   const settingsStore = new InMemorySettingsStore();
 *   app.use('/admin', createAdminRouter(userStore, { adminSecret, settingsStore }));
 *   // Also pass to auth router so 2FA disable policy is enforced:
 *   app.use('/auth', createAuthRouter(userStore, config, { settingsStore }));
 */
export class InMemorySettingsStore implements ISettingsStore {
  private settings: AuthSettings = {};

  async getSettings(): Promise<AuthSettings> {
    return { ...this.settings };
  }

  async updateSettings(updates: Partial<AuthSettings>): Promise<void> {
    this.settings = { ...this.settings, ...updates };
  }
}
