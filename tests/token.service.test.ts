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

  it('refresh token cookie uses "/" path by default (no hardcoded /auth/refresh)', () => {
    const pair = service.generateTokenPair({ sub: '1', email: 'a@a.com' }, config);
    const res = createResponse();
    service.setTokenCookies(res as any, pair, config);
    expect(res.cookieOptions['refreshToken']?.path).toBe('/');
  });

  it('refresh token cookie uses custom refreshTokenPath when configured', () => {
    const customConfig: AuthConfig = { ...config, cookieOptions: { refreshTokenPath: '/api/auth/refresh' } };
    const pair = service.generateTokenPair({ sub: '1', email: 'a@a.com' }, customConfig);
    const res = createResponse();
    service.setTokenCookies(res as any, pair, customConfig);
    expect(res.cookieOptions['refreshToken']?.path).toBe('/api/auth/refresh');
  });

  it('clearTokenCookies uses the same refreshTokenPath as setTokenCookies', () => {
    const customConfig: AuthConfig = { ...config, cookieOptions: { refreshTokenPath: '/api/auth/refresh' } };
    const res = createResponse();
    service.clearTokenCookies(res as any, customConfig);
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
});
