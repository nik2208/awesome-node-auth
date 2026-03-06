import { IApiKeyStore, ApiKeyAuditEntry } from '../../interfaces/api-key-store.interface';
import { ApiKeyService } from '../../services/api-key.service';
import { ApiKey, ApiKeyContext } from '../../models/api-key.model';
import { AuthError } from '../../models/errors';

/** Options that control how the strategy validates incoming requests. */
export interface ApiKeyStrategyOptions {
  /**
   * When `true`, `req.ip` (set by Express) is compared against the key's
   * `allowedIps` list.  If the IP is not on the list the request is rejected.
   *
   * @default true
   */
  enforceIpAllowlist?: boolean;

  /**
   * When provided, only keys that include **all** of the listed scopes are
   * accepted.  Use this to require specific capabilities at the middleware
   * level.
   *
   * @example `['tools:read']`
   */
  requiredScopes?: string[];

  /**
   * When `true`, a usage entry is appended to the store's audit log after
   * every authentication attempt (success or failure).
   *
   * @default false
   */
  auditLog?: boolean;
}

const apiKeyService = new ApiKeyService();

/**
 * Dummy bcrypt hash used when no key record is found in the store.
 * Running `verifyKey` against this hash ensures the bcrypt work factor is
 * always paid — preventing timing attacks that could reveal whether a given
 * key prefix exists in the database.
 */
const TIMING_MITIGATION_DUMMY_HASH = '$2a$10$invalidhashpaddingtomitigatetiming0000000000000000000';

/**
 * Stateless helper that validates API keys from an HTTP request.
 *
 * Accepted header formats (checked in order):
 *  1. `Authorization: ApiKey <key>`
 *  2. `X-Api-Key: <key>`
 *
 * Validation steps:
 *  1. Extract the key from the header.
 *  2. Find an active candidate record by prefix.
 *  3. Verify the bcrypt hash.
 *  4. Check expiry.
 *  5. (Optional) Check IP allowlist.
 *  6. (Optional) Check required scopes.
 *  7. Update `lastUsedAt` + optional audit log.
 */
export class ApiKeyStrategy {
  constructor(
    private readonly store: IApiKeyStore,
    private readonly options: ApiKeyStrategyOptions = {},
  ) {}

  /**
   * Extract and validate the API key from the provided headers and remote IP.
   *
   * @param headers  HTTP request headers (`req.headers`).
   * @param remoteIp Client IP address (`req.ip`).
   * @returns        The `ApiKeyContext` on success.
   * @throws         `AuthError` on any validation failure.
   */
  async authenticate(
    headers: Record<string, string | string[] | undefined>,
    remoteIp?: string,
  ): Promise<ApiKeyContext> {
    const rawKey = this.extractKey(headers);
    if (!rawKey) {
      throw new AuthError('API key is required', 'API_KEY_MISSING', 401);
    }

    const prefix = apiKeyService.extractPrefix(rawKey);
    const record = await this.store.findByPrefix(prefix);

    // Always run bcrypt even when no record is found (timing-attack mitigation).
    const hashToCompare = record?.keyHash ?? TIMING_MITIGATION_DUMMY_HASH;
    const valid = await apiKeyService.verifyKey(rawKey, hashToCompare);

    if (!valid || !record) {
      await this.appendAuditLog(null, remoteIp, headers, false, 'INVALID_KEY');
      throw new AuthError('Invalid API key', 'API_KEY_INVALID', 401);
    }

    // Key must still be active
    if (!record.isActive) {
      await this.appendAuditLog(record, remoteIp, headers, false, 'KEY_REVOKED');
      throw new AuthError('API key has been revoked', 'API_KEY_REVOKED', 401);
    }

    // Expiry check
    if (record.expiresAt && new Date() > record.expiresAt) {
      await this.appendAuditLog(record, remoteIp, headers, false, 'KEY_EXPIRED');
      throw new AuthError('API key has expired', 'API_KEY_EXPIRED', 401);
    }

    // IP allowlist check
    const enforceIp = this.options.enforceIpAllowlist !== false;
    if (enforceIp && record.allowedIps && record.allowedIps.length > 0) {
      if (!remoteIp || !this.isIpAllowed(remoteIp, record.allowedIps)) {
        await this.appendAuditLog(record, remoteIp, headers, false, 'IP_NOT_ALLOWED');
        throw new AuthError('IP address not allowed for this API key', 'API_KEY_IP_BLOCKED', 403);
      }
    }

    // Scope check
    const requiredScopes = this.options.requiredScopes ?? [];
    if (requiredScopes.length > 0) {
      const keyScopes = record.scopes ?? [];
      const missing = requiredScopes.filter((s) => !keyScopes.includes(s));
      if (missing.length > 0) {
        await this.appendAuditLog(record, remoteIp, headers, false, 'INSUFFICIENT_SCOPE');
        throw new AuthError(
          `API key missing required scopes: ${missing.join(', ')}`,
          'API_KEY_INSUFFICIENT_SCOPE',
          403,
        );
      }
    }

    // Success — update last-used timestamp and audit log
    await this.store.updateLastUsed(record.id, new Date());
    await this.appendAuditLog(record, remoteIp, headers, true);

    return {
      keyId: record.id,
      keyPrefix: record.keyPrefix,
      name: record.name,
      serviceId: record.serviceId,
      scopes: record.scopes ?? [],
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Extract the raw API key from the request headers.
   * Accepts `Authorization: ApiKey <key>` and `X-Api-Key: <key>`.
   */
  private extractKey(headers: Record<string, string | string[] | undefined>): string | null {
    const authHeader = headers['authorization'];
    if (typeof authHeader === 'string' && authHeader.startsWith('ApiKey ')) {
      return authHeader.slice(7).trim() || null;
    }
    const xApiKey = headers['x-api-key'];
    if (typeof xApiKey === 'string' && xApiKey.trim()) {
      return xApiKey.trim();
    }
    return null;
  }

  /**
   * Check whether `ip` is contained in one of the `allowedIps` entries.
   * Supports exact IPv4/IPv6 matches and CIDR notation for IPv4.
   */
  private isIpAllowed(ip: string, allowedIps: string[]): boolean {
    const normalized = ip.replace(/^::ffff:/, ''); // unwrap IPv4-mapped IPv6
    for (const entry of allowedIps) {
      if (entry.includes('/')) {
        if (this.ipInCidr(normalized, entry)) return true;
      } else if (normalized === entry || ip === entry) {
        return true;
      }
    }
    return false;
  }

  /** Simple IPv4 CIDR check. Returns false for IPv6 CIDRs (not supported). */
  private ipInCidr(ip: string, cidr: string): boolean {
    try {
      const [range, bitsStr] = cidr.split('/');
      const bits = parseInt(bitsStr, 10);
      if (isNaN(bits)) return false;
      const ipNum = this.ipToNumber(ip);
      const rangeNum = this.ipToNumber(range);
      if (ipNum === null || rangeNum === null) return false;
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (ipNum & mask) === (rangeNum & mask);
    } catch {
      return false;
    }
  }

  private ipToNumber(ip: string): number | null {
    const parts = ip.split('.');
    if (parts.length !== 4) return null;
    let num = 0;
    for (const part of parts) {
      const n = parseInt(part, 10);
      if (isNaN(n) || n < 0 || n > 255) return null;
      num = (num << 8) | n;
    }
    return num >>> 0;
  }

  private async appendAuditLog(
    record: ApiKey | null,
    ip: string | undefined,
    headers: Record<string, string | string[] | undefined>,
    success: boolean,
    failureReason?: string,
  ): Promise<void> {
    if (!this.options.auditLog || !this.store.logUsage) return;
    const entry: ApiKeyAuditEntry = {
      // When record is null (unknown key), use '<unknown>' so the attempt is
      // still audited without blocking and without exposing internal state.
      keyId: record?.id ?? '<unknown>',
      timestamp: new Date(),
      ip,
      userAgent: typeof headers['user-agent'] === 'string' ? headers['user-agent'] : undefined,
      success,
      failureReason,
    };
    try {
      await this.store.logUsage(entry);
    } catch {
      // Audit log failures must never block the request
    }
  }
}
