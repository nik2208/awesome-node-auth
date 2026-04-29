import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createJwksAuthMiddleware, _clearJwksClientCache } from '../src/middleware/jwks-auth.middleware';
import { JwksService, JwksClient } from '../src/services/jwks.service';
import { TokenService } from '../src/services/token.service';
import { AuthConfig } from '../src/models/auth-config.model';
import { createRequest, createResponse } from './test-helpers';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generate an RS256-signed token using the given private key. */
function makeIdpToken(
  privateKey: string,
  payload: Record<string, unknown>,
  expiresIn = '1h',
) {
  const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
  const { kid, ...restPayload } = payload;
  return jwt.sign(restPayload, privateKey, {
    algorithm: 'RS256',
    expiresIn,
    keyid: kid as string | undefined,
  } as any);
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('createJwksAuthMiddleware', () => {
  let keypair: { privateKey: string; publicKey: string };
  let config: AuthConfig;
  let jwksClient: JwksClient;

  beforeEach(() => {
    _clearJwksClientCache();

    keypair = JwksService.generateKeypair();

    config = {
      accessTokenSecret: 'local-hs256-secret',
      refreshTokenSecret: 'local-refresh-secret',
      resourceServer: {
        enabled: true,
        jwksUrl: 'https://idp.example.com/.well-known/jwks.json',
        issuer: 'https://idp.example.com',
      },
    };

    // Build a JwksClient whose getJwks() returns our test keypair
    jwksClient = JwksService.createRemoteClient(config.resourceServer!.jwksUrl);
    const doc = JwksService.buildJwksDocument(keypair.publicKey, 'provisioner-key-1');
    vi.spyOn(jwksClient, 'getJwks').mockResolvedValue(doc);
    vi.spyOn(jwksClient, 'getKey').mockImplementation(async (kid) => {
      return doc.keys.find((k) => k.kid === kid) ?? null;
    });
    vi.spyOn(jwksClient, 'invalidateCache').mockImplementation(() => {});

    // Inject this client into the module's client cache so that
    // createJwksAuthMiddleware reuses it.
    // We do this by pre-populating via the service factory (same key).
    vi.spyOn(JwksService, 'createRemoteClient').mockReturnValue(jwksClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _clearJwksClientCache();
  });

  it('throws if resourceServer.enabled is not true', () => {
    const badConfig: AuthConfig = {
      accessTokenSecret: 'x',
      refreshTokenSecret: 'y',
    };
    expect(() => createJwksAuthMiddleware(badConfig)).toThrow();
  });

  it('rejects requests with no token (403)', async () => {
    const middleware = createJwksAuthMiddleware(config);
    const req = createRequest({});
    const res = createResponse();
    await middleware(req as any, res as any, () => {});
    expect(res.statusCode).toBe(403);
  });

  it('accepts a valid RS256 Bearer token and sets req.user', async () => {
    const middleware = createJwksAuthMiddleware(config);

    const token = makeIdpToken(keypair.privateKey, {
      sub: 'user-1',
      email: 'user@example.com',
      iss: 'https://idp.example.com',
      kid: 'provisioner-key-1',
    });

    const req = createRequest({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = createResponse();
    let nextCalled = false;

    await middleware(req as any, res as any, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
    expect((req as any).user).toBeDefined();
    expect((req as any).user.sub).toBe('user-1');
    expect((req as any).user.email).toBe('user@example.com');
  });

  it('rejects a Bearer token with the wrong issuer (401)', async () => {
    const middleware = createJwksAuthMiddleware(config);

    const token = makeIdpToken(keypair.privateKey, {
      sub: 'user-2',
      email: 'user2@example.com',
      iss: 'https://evil.example.com',   // wrong issuer
      kid: 'provisioner-key-1',
    });

    const req = createRequest({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = createResponse();

    await middleware(req as any, res as any, () => {});

    expect(res.statusCode).toBe(401);
  });

  it('rejects an expired Bearer token (401)', async () => {
    const middleware = createJwksAuthMiddleware(config);

    const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
    const token = jwt.sign(
      {
        sub: 'user-3',
        email: 'user3@example.com',
        iss: 'https://idp.example.com',
        exp: Math.floor(Date.now() / 1000) - 10, // already expired
      },
      keypair.privateKey,
      { algorithm: 'RS256', keyid: 'provisioner-key-1' } as any,
    );

    const req = createRequest({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = createResponse();

    await middleware(req as any, res as any, () => {});

    expect(res.statusCode).toBe(401);
  });

  it('rejects a token with an unknown kid (401)', async () => {
    const middleware = createJwksAuthMiddleware(config);

    // getKey returns null for unknown kids
    vi.spyOn(jwksClient, 'getKey').mockResolvedValue(null);

    const token = makeIdpToken(keypair.privateKey, {
      sub: 'user-4',
      email: 'user4@example.com',
      iss: 'https://idp.example.com',
      kid: 'unknown-kid',
    });

    const req = createRequest({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = createResponse();

    await middleware(req as any, res as any, () => {});

    expect(res.statusCode).toBe(401);
  });

  it('falls back to HS256 cookie validation for non-Bearer tokens', async () => {
    const middleware = createJwksAuthMiddleware(config);
    const tokenService = new TokenService();
    const tokens = tokenService.generateTokenPair(
      { sub: 'cookie-user', email: 'cookie@example.com' },
      config,
    );

    const req = createRequest({ cookies: { accessToken: tokens.accessToken } });
    const res = createResponse();
    let nextCalled = false;

    await middleware(req as any, res as any, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
    expect((req as any).user?.sub).toBe('cookie-user');
  });

  it('rejects an invalid cookie-based token (401)', async () => {
    const middleware = createJwksAuthMiddleware(config);
    const req = createRequest({ cookies: { accessToken: 'invalid.token.here' } });
    const res = createResponse();

    await middleware(req as any, res as any, () => {});

    expect(res.statusCode).toBe(401);
  });
});
