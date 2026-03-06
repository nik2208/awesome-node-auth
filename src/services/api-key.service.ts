import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { ApiKey } from '../models/api-key.model';
import { IApiKeyStore } from '../interfaces/api-key-store.interface';

/** Options for generating a new API key. */
export interface CreateApiKeyOptions {
  /** Human-readable name / label for the key. */
  name: string;
  /** Optional service identity (user ID, tenant ID, service name, …). */
  serviceId?: string;
  /** Scope strings controlling access (e.g. `['tools:read', 'webhooks:receive']`). */
  scopes?: string[];
  /** IP allowlist (CIDR notation or individual addresses). */
  allowedIps?: string[];
  /** Expiry date. Omit for a non-expiring key. */
  expiresAt?: Date;
  /** bcrypt salt rounds (default: 10 — intentionally lower than user-password hashing). */
  saltRounds?: number;
}

/** The result of key creation — contains the raw key (show once, then discard). */
export interface CreatedApiKey {
  /** The full key to present to the caller — store this securely, it cannot be recovered. */
  rawKey: string;
  /** The persisted key record (does not include the raw key). */
  record: ApiKey;
}

/**
 * Service for creating and validating API Keys / Service Tokens.
 *
 * Raw keys are formatted as `ak_<48 hex chars>` (196 bits of entropy).
 * The first 8 characters after `ak_` are used as a prefix index; the full
 * value is stored only in its bcrypt hash form.
 */
export class ApiKeyService {
  private readonly saltRounds: number;

  constructor(saltRounds = 10) {
    this.saltRounds = saltRounds;
  }

  /**
   * Generate a new API key, hash it, persist it via the store, and return
   * the plaintext key **once**.
   */
  async createKey(store: IApiKeyStore, options: CreateApiKeyOptions): Promise<CreatedApiKey> {
    const raw = this.generateRawKey();
    const prefix = this.extractPrefix(raw);
    const rounds = options.saltRounds ?? this.saltRounds;
    const hash = await bcrypt.hash(raw, rounds);

    const record: ApiKey = {
      id: crypto.randomUUID(),
      name: options.name,
      keyHash: hash,
      keyPrefix: prefix,
      serviceId: options.serviceId ?? null,
      scopes: options.scopes ?? [],
      allowedIps: options.allowedIps ?? null,
      isActive: true,
      expiresAt: options.expiresAt ?? null,
      createdAt: new Date(),
      lastUsedAt: null,
    };

    await store.save(record);
    return { rawKey: raw, record };
  }

  /**
   * Verify a raw API key against its stored bcrypt hash.
   * Returns `true` when the key matches the hash.
   */
  async verifyKey(rawKey: string, hash: string): Promise<boolean> {
    return bcrypt.compare(rawKey, hash);
  }

  /**
   * Extract the 8-character prefix used as a lookup index.
   * Input: `ak_<48 hex chars>` → prefix: `ak_<first 8 chars>`
   */
  extractPrefix(rawKey: string): string {
    // Keep the `ak_` sentinel plus the first 8 hex characters
    return rawKey.substring(0, 11); // 'ak_' (3) + 8 chars = 11
  }

  /** Generate a cryptographically secure raw key string. */
  private generateRawKey(): string {
    return `ak_${crypto.randomBytes(24).toString('hex')}`; // 24 bytes = 48 hex = ~196 bits
  }
}
