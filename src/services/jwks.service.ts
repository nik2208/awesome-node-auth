import crypto from 'crypto';
import https from 'https';
import http from 'http';

export interface JWK {
  kty: string;
  use: string;
  alg: string;
  kid: string;
  n: string;
  e: string;
}

export interface JwksDocument {
  keys: JWK[];
}

export interface JwksClientOptions {
  /** Cache TTL in milliseconds. @default 3_600_000 */
  cacheTtl?: number;
  /** Fetch timeout in milliseconds. @default 5000 */
  fetchTimeout?: number;
}

/**
 * A simple cached JWKS client for Resource Server use.
 * Fetches and caches the public keys from a remote JWKS URL.
 */
export class JwksClient {
  private cachedDocument: JwksDocument | null = null;
  private cacheExpiry = 0;
  private readonly cacheTtl: number;
  private readonly fetchTimeout: number;
  private fetchPromise: Promise<JwksDocument> | null = null;

  constructor(
    public readonly jwksUrl: string,
    options: JwksClientOptions = {},
  ) {
    this.cacheTtl = options.cacheTtl ?? 3_600_000;
    this.fetchTimeout = options.fetchTimeout ?? 5000;
  }

  /**
   * Get the JWKS document, fetching from remote if the cache is stale.
   * Uses stale-while-revalidate: returns the cached doc immediately if available,
   * then refreshes in the background when TTL expires.
   */
  async getJwks(): Promise<JwksDocument> {
    const now = Date.now();
    if (this.cachedDocument && now < this.cacheExpiry) {
      return this.cachedDocument;
    }

    // If a fetch is already in progress, wait for it
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    // Stale-while-revalidate: return cached doc immediately if we have one,
    // and trigger background refresh
    if (this.cachedDocument) {
      this.fetchPromise = this._fetch()
        .then((doc) => {
          this.cachedDocument = doc;
          this.cacheExpiry = Date.now() + this.cacheTtl;
          this.fetchPromise = null;
          return doc;
        })
        .catch(() => {
          this.fetchPromise = null;
          return this.cachedDocument!;
        });
      // Return stale cache immediately
      return this.cachedDocument;
    }

    // No cache at all — must wait for the initial fetch
    this.fetchPromise = this._fetch().then((doc) => {
      this.cachedDocument = doc;
      this.cacheExpiry = Date.now() + this.cacheTtl;
      this.fetchPromise = null;
      return doc;
    });

    try {
      return await this.fetchPromise;
    } catch (err) {
      this.fetchPromise = null;
      throw err;
    }
  }

  /** Find a JWK by its key ID (`kid`). Returns null if not found. */
  async getKey(kid: string): Promise<JWK | null> {
    const doc = await this.getJwks();
    return doc.keys.find((k) => k.kid === kid) ?? null;
  }

  /** Force-invalidate the cache so the next call fetches fresh keys. */
  invalidateCache(): void {
    this.cachedDocument = null;
    this.cacheExpiry = 0;
    this.fetchPromise = null;
  }

  private _fetch(): Promise<JwksDocument> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.jwksUrl);
      const transport = url.protocol === 'https:' ? https : http;
      const timeout = setTimeout(() => reject(new Error(`JWKS fetch timed out: ${this.jwksUrl}`)), this.fetchTimeout);
      const req = transport.get(this.jwksUrl, (res) => {
        if (res.statusCode !== 200) {
          clearTimeout(timeout);
          reject(new Error(`JWKS fetch failed with status ${res.statusCode}`));
          res.resume();
          return;
        }
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          clearTimeout(timeout);
          try {
            const doc = JSON.parse(data) as JwksDocument;
            if (!Array.isArray(doc.keys)) {
              reject(new Error('Invalid JWKS document: missing "keys" array'));
              return;
            }
            resolve(doc);
          } catch {
            reject(new Error('Invalid JWKS document: failed to parse JSON'));
          }
        });
      });
      req.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }
}

export class JwksService {
  /**
   * Generate an RSA-2048 keypair.
   * Returns PEM-encoded `privateKey` and `publicKey` strings.
   */
  static generateKeypair(): { privateKey: string; publicKey: string } {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    return { privateKey, publicKey };
  }

  /**
   * Derive the public key PEM from a private key PEM.
   */
  static derivePublicKey(privateKeyPem: string): string {
    const keyObj = crypto.createPrivateKey(privateKeyPem);
    return crypto.createPublicKey(keyObj).export({ type: 'spki', format: 'pem' }) as string;
  }

  /**
   * Convert a PEM-encoded RSA public key to JWK format.
   */
  static publicKeyToJwk(publicKeyPem: string, kid: string): JWK {
    const keyObj = crypto.createPublicKey(publicKeyPem);
    const jwk = keyObj.export({ format: 'jwk' }) as { kty: string; n: string; e: string };
    return {
      kty: jwk.kty,
      use: 'sig',
      alg: 'RS256',
      kid,
      n: jwk.n,
      e: jwk.e,
    };
  }

  /**
   * Build a full JWKS document from a PEM-encoded RSA public key.
   */
  static buildJwksDocument(publicKeyPem: string, kid = 'provisioner-key-1'): JwksDocument {
    return { keys: [JwksService.publicKeyToJwk(publicKeyPem, kid)] };
  }

  /**
   * Create a cached JWKS client for a remote URL (Resource Server use).
   */
  static createRemoteClient(jwksUrl: string, options?: JwksClientOptions): JwksClient {
    return new JwksClient(jwksUrl, options);
  }

  /**
   * Convert a JWK (`n`, `e` fields) to an RSA public key PEM string
   * usable by `jwt.verify()`.
   */
  static jwkToPublicKey(jwk: JWK): string {
    const keyObj = crypto.createPublicKey({ key: jwk as unknown as Record<string, unknown>, format: 'jwk' });
    return keyObj.export({ type: 'spki', format: 'pem' }) as string;
  }
}
