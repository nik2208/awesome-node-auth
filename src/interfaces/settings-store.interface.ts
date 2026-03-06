/**
 * Optional store for global authentication settings.
 *
 * Implement this interface when you need to persist global auth configuration
 * (e.g., mandatory email verification, mandatory 2FA) that can be toggled by
 * administrators at runtime via the admin UI's Control panel.
 *
 * @example
 * ```typescript
 * import { ISettingsStore, AuthSettings } from 'awesome-node-auth';
 *
 * export class MySettingsStore implements ISettingsStore {
 *   private settings: AuthSettings = {};
 *
 *   async getSettings(): Promise<AuthSettings> {
 *     const row = await db.from('settings').first();
 *     return row ? JSON.parse(row.data) : {};
 *   }
 *
 *   async updateSettings(settings: Partial<AuthSettings>): Promise<void> {
 *     const current = await this.getSettings();
 *     const merged = { ...current, ...settings };
 *     await db('settings').update({ data: JSON.stringify(merged) });
 *   }
 * }
 * ```
 */
export interface ISettingsStore {
  /**
   * Retrieve all current authentication settings.
   * Returns an empty object if no settings have been configured.
   */
  getSettings(): Promise<AuthSettings>;

  /**
   * Merge (shallow-patch) the provided settings into the store.
   * Settings not present in the input are left untouched.
   */
  updateSettings(settings: Partial<AuthSettings>): Promise<void>;
}

/**
 * Global authentication settings that can be toggled by admins at runtime.
 */
export interface AuthSettings {
  /** Whether email verification is mandatory for all users. */
  requireEmailVerification?: boolean;
  /**
   * Global email-verification enforcement mode.
   * When set, overrides `requireEmailVerification`.
   * - `'none'`   — not required.
   * - `'lazy'`   — user may log in until `emailVerificationDeadline` expires.
   * - `'strict'` — login blocked until email is verified.
   */
  emailVerificationMode?: 'none' | 'lazy' | 'strict';
  /**
   * When `emailVerificationMode` is `'lazy'`, the number of days after
   * account creation before the user must verify their email.
   * Used by the admin UI to display and update the grace period.
   * Defaults to `7` when not set.
   */
  lazyEmailVerificationGracePeriodDays?: number;
  /** Whether two-factor authentication is mandatory for all users. */
  require2FA?: boolean;
  /**
   * IDs of webhook actions that are globally enabled by the administrator.
   *
   * Only actions whose IDs appear in this array can be injected into the
   * `vm` sandbox of an inbound webhook.  This provides a global circuit-
   * breaker on top of the per-webhook `allowedActions` list.
   *
   * Managed via the Admin UI's Control → Webhook Actions panel.
   */
  enabledWebhookActions?: string[];
}
