export interface BaseUser {
  id: string;
  email: string;
  password?: string;
  role?: string;
  /** First name of the user (optional). */
  firstName?: string | null;
  /** Last name / surname of the user (optional). */
  lastName?: string | null;
  /**
   * Authentication provider used to create/link this account.
   * Examples: `'local'`, `'google'`, `'github'`, `'magic-link'`, `'sms'`.
   * Defaults to `'local'` when not set.
   */
  loginProvider?: string | null;
  refreshToken?: string | null;
  refreshTokenExpiry?: Date | null;
  resetToken?: string | null;
  resetTokenExpiry?: Date | null;
  /**
   * TOTP secret stored after the user completes the 2FA setup flow
   * (`POST /auth/2fa/verify-setup`).  When `null` the user has not paired an
   * authenticator app yet.
   */
  totpSecret?: string | null;
  isEmailVerified?: boolean;
  /**
   * Whether the user has successfully completed the TOTP setup flow.
   * Set to `true` by `POST /auth/2fa/verify-setup`, set to `false` by
   * `POST /auth/2fa/disable`.
   */
  isTotpEnabled?: boolean;
  magicLinkToken?: string | null;
  magicLinkTokenExpiry?: Date | null;
  smsCode?: string | null;
  smsCodeExpiry?: Date | null;
  phoneNumber?: string | null;
  /** When `true` this user must have 2FA active to complete login. */
  require2FA?: boolean;
  /** Token sent in the email-verification link. */
  emailVerificationToken?: string | null;
  /** Expiry for the email-verification token. */
  emailVerificationTokenExpiry?: Date | null;
  /**
   * Deadline by which the user must verify their email address when
   * `emailVerificationMode` is set to `'lazy'`.  After this date the login
   * is blocked until the email is confirmed.  Set this field (e.g. to
   * `createdAt + gracePeriodDays`) when creating a new user; leave `null` to
   * keep the user in a permanent grace period.
   */
  emailVerificationDeadline?: Date | null;
  /** New email address awaiting confirmation in the change-email flow. */
  pendingEmail?: string | null;
  /** Token sent to the new address in the change-email flow. */
  emailChangeToken?: string | null;
  /** Expiry for the email-change token. */
  emailChangeTokenExpiry?: Date | null;
  /** Email address being linked in the account-link flow. */
  accountLinkPendingEmail?: string | null;
  /** Provider name being linked in the account-link flow (defaults to `'email'`). */
  accountLinkPendingProvider?: string | null;
  /** Token sent to the target email in the account-link flow. */
  accountLinkToken?: string | null;
  /** Expiry for the account-link token. */
  accountLinkTokenExpiry?: Date | null;
  /**
   * The unique user identifier returned by the OAuth provider (e.g. Google's
   * `sub` claim, GitHub's numeric user id).  Used with `loginProvider` to look
   * up existing OAuth accounts without relying on email matching, which is
   * vulnerable to account-takeover attacks.
   *
   * Store this alongside `loginProvider` so that `IUserStore.findByProviderAccount`
   * can perform a precise (`provider` + `providerAccountId`) lookup.
   */
  providerAccountId?: string | null;
  /**
   * Timestamp of the user's last successful login.  Useful for purging inactive
   * users or for auditing purposes.
   */
  lastLogin?: Date | null;
}
