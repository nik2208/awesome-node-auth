/**
 * Domain model for an API Key / Service Token.
 *
 * The raw key value is **never** stored — only the bcrypt hash is persisted.
 * The plaintext key is returned exactly once at creation time.
 */
export interface ApiKey {
  /** Unique identifier for the key record (UUID or similar). */
  id: string;

  /**
   * Human-readable label to identify the key (e.g. `'webhook-stripe'`).
   * Shown in audit logs and the admin UI.
   */
  name: string;

  /**
   * Bcrypt hash of the raw key.  Never expose this to the caller.
   */
  keyHash: string;

  /**
   * Key prefix — the first 8 characters of the raw key, stored in plaintext
   * so that keys can be identified in the UI without revealing the full secret.
   * Format: `ak_<8 chars>…`
   */
  keyPrefix: string;

  /**
   * Optional service/machine identity this key is attached to.
   * Can be a user ID, a tenant ID, a service name — whatever makes sense for
   * the consuming application.
   */
  serviceId?: string | null;

  /**
   * Scope strings that restrict what this key can access.
   * Interpreted by the consuming application; the library passes them through
   * via `req.apiKey.scopes`.
   *
   * @example `['tools:read', 'tools:write', 'webhooks:receive']`
   */
  scopes?: string[];

  /**
   * Optional CIDR ranges or individual IPs that are allowed to use this key.
   * When `null` or empty, no IP restriction is applied.
   *
   * @example `['10.0.0.0/8', '203.0.113.42']`
   */
  allowedIps?: string[] | null;

  /** Whether the key is active. Set to `false` to revoke immediately. */
  isActive: boolean;

  /** Optional expiry date after which the key is no longer valid. */
  expiresAt?: Date | null;

  /** When this key record was created. */
  createdAt: Date;

  /** Timestamp of the most recent successful use of this key. */
  lastUsedAt?: Date | null;
}

/**
 * Context attached to `req.apiKey` after a successful API key authentication.
 */
export interface ApiKeyContext {
  /** The API key record (without the hash). */
  keyId: string;
  keyPrefix: string;
  name: string;
  serviceId?: string | null;
  scopes: string[];
}
