import { describe, it, expect, beforeEach } from 'vitest';
import { TokenService } from '../src/services/token.service';
import { AuthConfig } from '../src/models/auth-config.model';
import { createRequest, createResponse } from './test-helpers';

const config: AuthConfig = {
  accessTokenSecret: 'test-access-secret',
  refreshTokenSecret: 'test-refresh-secret',
  accessTokenExpiresIn: '15m',
  refreshTokenExpiresIn: '7d',
};

describe('TokenService', () => {
  let service: TokenService;

  beforeEach(() => {
    service = new TokenService();
  });

  it('generates a token pair', () => {
    const pair = service.generateTokenPair({ sub: '1', email: 'test@test.com' }, config);
    expect(pair.accessToken).toBeTruthy();
    expect(pair.refreshToken).toBeTruthy();
  });

  it('verifies access token', () => {
    const pair = service.generateTokenPair({ sub: '1', email: 'test@test.com', role: 'user' }, config);
    const payload = service.verifyAccessToken(pair.accessToken, config);
    expect(payload.sub).toBe('1');
    expect(payload.email).toBe('test@test.com');
    expect(payload.role).toBe('user');
  });

  it('verifies refresh token', () => {
    const pair = service.generateTokenPair({ sub: '1', email: 'test@test.com' }, config);
    const payload = service.verifyRefreshToken(pair.refreshToken, config);
    expect(payload.sub).toBe('1');
  });

  it('throws on invalid access token', () => {
    expect(() => service.verifyAccessToken('invalid', config)).toThrow();
  });

  it('throws on invalid refresh token', () => {
    expect(() => service.verifyRefreshToken('invalid', config)).toThrow();
  });

  it('generates secure token', () => {
    const t1 = service.generateSecureToken();
    const t2 = service.generateSecureToken();
    expect(t1).toHaveLength(64);
    expect(t1).not.toBe(t2);
  });

  it('sets and clears cookies', () => {
    const pair = service.generateTokenPair({ sub: '1', email: 'a@a.com' }, config);
    const res = createResponse();
    service.setTokenCookies(res as any, pair, config);
    expect(res.cookies['accessToken']).toBeDefined();
    expect(res.cookies['refreshToken']).toBeDefined();
    service.clearTokenCookies(res as any);
    expect(res.clearedCookies).toContain('accessToken');
  });

  it('refresh token cookie uses "/auth/refresh" path by default', () => {
    const pair = service.generateTokenPair({ sub: '1', email: 'a@a.com' }, config);
    const res = createResponse();
    service.setTokenCookies(res as any, pair, config);
    expect(res.cookieOptions['refreshToken']?.path).toBe('/auth/refresh');
  });

  it('refresh token cookie uses custom refreshTokenPath when configured', () => {
    const customConfig: AuthConfig = { ...config, cookieOptions: { refreshTokenPath: '/api/auth/refresh' } };
    const pair = service.generateTokenPair({ sub: '1', email: 'a@a.com' }, customConfig);
    const res = createResponse();
    service.setTokenCookies(res as any, pair, customConfig);
    expect(res.cookieOptions['refreshToken']?.path).toBe('/api/auth/refresh');
  });

  it('refresh token cookie path is auto-derived from apiPrefix when refreshTokenPath is not set', () => {
    const prefixConfig: AuthConfig = { ...config, apiPrefix: '/api/auth' };
    const pair = service.generateTokenPair({ sub: '1', email: 'a@a.com' }, prefixConfig);
    const res = createResponse();
    service.setTokenCookies(res as any, pair, prefixConfig);
    expect(res.cookieOptions['refreshToken']?.path).toBe('/api/auth/refresh');
  });

  it('explicit refreshTokenPath takes precedence over apiPrefix', () => {
    const prefixConfig: AuthConfig = { ...config, apiPrefix: '/api/auth', cookieOptions: { refreshTokenPath: '/custom/refresh' } };
    const pair = service.generateTokenPair({ sub: '1', email: 'a@a.com' }, prefixConfig);
    const res = createResponse();
    service.setTokenCookies(res as any, pair, prefixConfig);
    expect(res.cookieOptions['refreshToken']?.path).toBe('/custom/refresh');
  });

  it('clearTokenCookies uses the same refreshTokenPath as setTokenCookies', () => {
    const customConfig: AuthConfig = { ...config, cookieOptions: { refreshTokenPath: '/api/auth/refresh' } };
    const res = createResponse();
    service.clearTokenCookies(res as any, customConfig);
    expect(res.clearedCookieOptions['refreshToken']?.path).toBe('/api/auth/refresh');
  });

  it('clearTokenCookies default path matches setTokenCookies default', () => {
    const res = createResponse();
    service.clearTokenCookies(res as any, config);
    expect(res.clearedCookieOptions['refreshToken']?.path).toBe('/auth/refresh');
  });

  it('clearTokenCookies auto-derives path from apiPrefix', () => {
    const prefixConfig: AuthConfig = { ...config, apiPrefix: '/api/auth' };
    const res = createResponse();
    service.clearTokenCookies(res as any, prefixConfig);
    expect(res.clearedCookieOptions['refreshToken']?.path).toBe('/api/auth/refresh');
  });

  it('does not set csrf-token cookie when csrf is disabled', () => {
    const pair = service.generateTokenPair({ sub: '1', email: 'a@a.com' }, config);
    const res = createResponse();
    service.setTokenCookies(res as any, pair, config);
    expect(res.cookies['csrf-token']).toBeUndefined();
  });

  it('sets a non-HttpOnly csrf-token cookie when csrf.enabled is true', () => {
    const csrfConfig: AuthConfig = { ...config, csrf: { enabled: true } };
    const pair = service.generateTokenPair({ sub: '1', email: 'a@a.com' }, csrfConfig);
    const res = createResponse();
    service.setTokenCookies(res as any, pair, csrfConfig);
    expect(res.cookies['csrf-token']).toBeDefined();
    expect(res.cookieOptions['csrf-token']?.httpOnly).toBe(false);
  });

  it('clearTokenCookies clears csrf-token when csrf.enabled is true', () => {
    const csrfConfig: AuthConfig = { ...config, csrf: { enabled: true } };
    const res = createResponse();
    service.clearTokenCookies(res as any, csrfConfig);
    expect(res.clearedCookies).toContain('csrf-token');
  });

  it('extracts token from cookie header', () => {
    const req = createRequest({ headers: { cookie: 'accessToken=abc123' } });
    const token = service.extractTokenFromCookie(req as any, 'accessToken');
    expect(token).toBe('abc123');
  });

  it('extracts token from req.cookies', () => {
    const req = createRequest({ cookies: { accessToken: 'xyz789' } });
    const token = service.extractTokenFromCookie(req as any, 'accessToken');
    expect(token).toBe('xyz789');
  });

  it('returns null if no cookie', () => {
    const req = createRequest({});
    const token = service.extractTokenFromCookie(req as any, 'accessToken');
    expect(token).toBeNull();
  });

  it('initCsrfToken sets csrf-token cookie when csrf.enabled is true', () => {
    const csrfConfig: AuthConfig = { ...config, csrf: { enabled: true } };
    const res = createResponse();
    service.initCsrfToken(res as any, csrfConfig);
    expect(res.cookies['csrf-token']).toBeDefined();
    expect(res.cookieOptions['csrf-token']?.httpOnly).toBe(false);
  });

  it('initCsrfToken does nothing when csrf is disabled', () => {
    const res = createResponse();
    service.initCsrfToken(res as any, config);
    expect(res.cookies['csrf-token']).toBeUndefined();
  });

  it('includes custom claims in the access token', () => {
    const pair = service.generateTokenPair(
      { sub: '1', email: 'a@a.com', role: 'admin', permissions: ['read', 'write'], tenantId: 'acme' },
      config
    );
    const payload = service.verifyAccessToken(pair.accessToken, config);
    expect(payload.permissions).toEqual(['read', 'write']);
    expect(payload.tenantId).toBe('acme');
  });

  it('includes custom claims in the refresh token', () => {
    const pair = service.generateTokenPair(
      { sub: '1', email: 'a@a.com', tenantId: 'acme' },
      config
    );
    const payload = service.verifyRefreshToken(pair.refreshToken, config);
    expect(payload.tenantId).toBe('acme');
  });

  describe('Cookie Prefixes', () => {
    it('applies __Host- prefix when secure is true, path is / (default) and domain is empty', () => {
      const secureConfig: AuthConfig = { ...config, cookieOptions: { secure: true } };
      const pair = service.generateTokenPair({ sub: '1', email: 'a@a.com' }, secureConfig);
      const res = createResponse();
      service.setTokenCookies(res as any, pair, secureConfig);
      expect(res.cookies['__Host-accessToken']).toBeDefined();
      expect(res.cookieOptions['__Host-accessToken']?.domain).toBeUndefined();
      expect(res.cookies['__Host-refreshToken']).toBeDefined();
      expect(res.cookieOptions['__Host-refreshToken']?.domain).toBeUndefined();
    });

    it('applies __Secure- prefix when secure is true and path is not /', () => {
      const secureConfig: AuthConfig = { ...config, cookieOptions: { secure: true, path: '/api' } };
      const pair = service.generateTokenPair({ sub: '1', email: 'a@a.com' }, secureConfig);
      const res = createResponse();
      service.setTokenCookies(res as any, pair, secureConfig);
      expect(res.cookies['__Secure-accessToken']).toBeDefined();
    });

    it('applies __Secure- prefix when secure is true and domain is set', () => {
      const secureConfig: AuthConfig = { ...config, cookieOptions: { secure: true, domain: 'example.com' } };
      const pair = service.generateTokenPair({ sub: '1', email: 'a@a.com' }, secureConfig);
      const res = createResponse();
      service.setTokenCookies(res as any, pair, secureConfig);
      expect(res.cookies['__Secure-accessToken']).toBeDefined();
      expect(res.cookieOptions['__Secure-accessToken']?.domain).toBe('example.com');
    });

    it('does not apply prefix when secure is false', () => {
      const insecureConfig: AuthConfig = { ...config, cookieOptions: { secure: false } };
      const pair = service.generateTokenPair({ sub: '1', email: 'a@a.com' }, insecureConfig);
      const res = createResponse();
      service.setTokenCookies(res as any, pair, insecureConfig);
      expect(res.cookies['accessToken']).toBeDefined();
      expect(res.cookies['__Host-accessToken']).toBeUndefined();
    });

    it('extractTokenFromCookie prefers __Host- over __Secure- over no prefix', () => {
      const req = createRequest({
        headers: {
          cookie: 'accessToken=none; __Secure-accessToken=secure; __Host-accessToken=host'
        }
      });
      expect(service.extractTokenFromCookie(req as any, 'accessToken')).toBe('host');

      const req2 = createRequest({
        headers: {
          cookie: 'accessToken=none; __Secure-accessToken=secure'
        }
      });
      expect(service.extractTokenFromCookie(req2 as any, 'accessToken')).toBe('secure');
    });

    it('clearTokenCookies defensively clears all prefix variants', () => {
      const res = createResponse();
      service.clearTokenCookies(res as any, config);

      // Should clear base name
      expect(res.clearedCookies).toContain('accessToken');
      expect(res.clearedCookies).toContain('refreshToken');

      // Should also clear prefixed versions defensively
      expect(res.clearedCookies).toContain('__Host-accessToken');
      expect(res.clearedCookies).toContain('__Secure-accessToken');
      expect(res.clearedCookies).toContain('__Host-refreshToken');
      expect(res.clearedCookies).toContain('__Secure-refreshToken');
    });

    it('setTokenCookies sets __Host-csrf-token when secure=true, path=/ (default), no domain, csrf.enabled', () => {
      const secureConfig: AuthConfig = { ...config, cookieOptions: { secure: true }, csrf: { enabled: true } };
      const pair = service.generateTokenPair({ sub: '1', email: 'a@a.com' }, secureConfig);
      const res = createResponse();
      service.setTokenCookies(res as any, pair, secureConfig);
      expect(res.cookies['__Host-csrf-token']).toBeDefined();
      expect(res.cookieOptions['__Host-csrf-token']?.httpOnly).toBe(false);
      expect(res.cookieOptions['__Host-csrf-token']?.domain).toBeUndefined();
      // Unprefixed version should NOT be set (prefix takes over)
      expect(res.cookies['csrf-token']).toBeUndefined();
    });

    it('setTokenCookies sets __Secure-csrf-token when secure=true, domain set, csrf.enabled', () => {
      const secureConfig: AuthConfig = { ...config, cookieOptions: { secure: true, domain: 'example.com' }, csrf: { enabled: true } };
      const pair = service.generateTokenPair({ sub: '1', email: 'a@a.com' }, secureConfig);
      const res = createResponse();
      service.setTokenCookies(res as any, pair, secureConfig);
      expect(res.cookies['__Secure-csrf-token']).toBeDefined();
      expect(res.cookieOptions['__Secure-csrf-token']?.httpOnly).toBe(false);
      expect(res.cookieOptions['__Secure-csrf-token']?.domain).toBe('example.com');
      expect(res.cookies['csrf-token']).toBeUndefined();
    });

    it('setTokenCookies sets __Secure-csrf-token when secure=true, path is not /, csrf.enabled', () => {
      const secureConfig: AuthConfig = { ...config, cookieOptions: { secure: true, path: '/api' }, csrf: { enabled: true } };
      const pair = service.generateTokenPair({ sub: '1', email: 'a@a.com' }, secureConfig);
      const res = createResponse();
      service.setTokenCookies(res as any, pair, secureConfig);
      expect(res.cookies['__Secure-csrf-token']).toBeDefined();
      expect(res.cookieOptions['__Secure-csrf-token']?.httpOnly).toBe(false);
      expect(res.cookies['csrf-token']).toBeUndefined();
    });

    it('initCsrfToken sets __Host-csrf-token when secure=true, path=/, no domain', () => {
      const secureConfig: AuthConfig = { ...config, cookieOptions: { secure: true }, csrf: { enabled: true } };
      const res = createResponse();
      service.initCsrfToken(res as any, secureConfig);
      expect(res.cookies['__Host-csrf-token']).toBeDefined();
      expect(res.cookieOptions['__Host-csrf-token']?.httpOnly).toBe(false);
      expect(res.cookies['csrf-token']).toBeUndefined();
    });

    it('initCsrfToken sets __Secure-csrf-token when secure=true and domain is set', () => {
      const secureConfig: AuthConfig = { ...config, cookieOptions: { secure: true, domain: 'example.com' }, csrf: { enabled: true } };
      const res = createResponse();
      service.initCsrfToken(res as any, secureConfig);
      expect(res.cookies['__Secure-csrf-token']).toBeDefined();
      expect(res.cookieOptions['__Secure-csrf-token']?.httpOnly).toBe(false);
      expect(res.cookieOptions['__Secure-csrf-token']?.domain).toBe('example.com');
    });

    it('clearTokenCookies defensively clears all csrf-token prefix variants when csrf.enabled', () => {
      const csrfSecureConfig: AuthConfig = { ...config, cookieOptions: { secure: true }, csrf: { enabled: true } };
      const res = createResponse();
      service.clearTokenCookies(res as any, csrfSecureConfig);
      // All three names should be attempted for clearing
      expect(res.clearedCookies).toContain('csrf-token');
      expect(res.clearedCookies).toContain('__Host-csrf-token');
      expect(res.clearedCookies).toContain('__Secure-csrf-token');
    });

    it('unprefixed csrf-token is set when secure is false', () => {
      const csrfConfig: AuthConfig = { ...config, cookieOptions: { secure: false }, csrf: { enabled: true } };
      const pair = service.generateTokenPair({ sub: '1', email: 'a@a.com' }, csrfConfig);
      const res = createResponse();
      service.setTokenCookies(res as any, pair, csrfConfig);
      expect(res.cookies['csrf-token']).toBeDefined();
      expect(res.cookies['__Host-csrf-token']).toBeUndefined();
      expect(res.cookies['__Secure-csrf-token']).toBeUndefined();
    });
  });
});
