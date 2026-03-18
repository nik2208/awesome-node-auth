import { describe, it, expect, vi } from 'vitest';
import { createAuthMiddleware } from '../src/middleware/auth.middleware';
import { TokenService } from '../src/services/token.service';
import { AuthConfig } from '../src/models/auth-config.model';
import { SessionInfo } from '../src/models/session.model';
import { createRequest, createResponse } from './test-helpers';

const config: AuthConfig = {
  accessTokenSecret: 'test-secret',
  refreshTokenSecret: 'refresh-secret',
};

const tokenService = new TokenService();

describe('createAuthMiddleware', () => {
  it('sets req.user on valid token', () => {
    const middleware = createAuthMiddleware(config);
    const tokens = tokenService.generateTokenPair({ sub: '1', email: 'a@a.com' }, config);
    const req = createRequest({ cookies: { accessToken: tokens.accessToken } });
    const res = createResponse();
    let nextCalled = false;
    middleware(req as any, res as any, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect((req as any).user).toBeDefined();
    expect((req as any).user.sub).toBe('1');
  });

  it('returns 403 on missing token', () => {
    const middleware = createAuthMiddleware(config);
    const req = createRequest({});
    const res = createResponse();
    middleware(req as any, res as any, () => {});
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 on invalid token', () => {
    const middleware = createAuthMiddleware(config);
    const req = createRequest({ cookies: { accessToken: 'bad.token.here' } });
    const res = createResponse();
    middleware(req as any, res as any, () => {});
    expect(res.statusCode).toBe(403);
  });

  it('reads token from Cookie header when req.cookies not present', () => {
    const middleware = createAuthMiddleware(config);
    const tokens = tokenService.generateTokenPair({ sub: '2', email: 'b@b.com' }, config);
    const req = createRequest({ headers: { cookie: `accessToken=${tokens.accessToken}` } });
    const res = createResponse();
    let nextCalled = false;
    middleware(req as any, res as any, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });
});

describe('createAuthMiddleware CSRF validation', () => {
  const csrfConfig: AuthConfig = { ...config, csrf: { enabled: true } };

  it('passes when X-CSRF-Token header matches csrf-token cookie', () => {
    const middleware = createAuthMiddleware(csrfConfig);
    const tokens = tokenService.generateTokenPair({ sub: '1', email: 'a@a.com' }, csrfConfig);
    const req = createRequest({
      cookies: { accessToken: tokens.accessToken, 'csrf-token': 'tok123' },
      headers: { 'x-csrf-token': 'tok123' },
    });
    const res = createResponse();
    let nextCalled = false;
    middleware(req as any, res as any, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('returns 403 when X-CSRF-Token header is missing', () => {
    const middleware = createAuthMiddleware(csrfConfig);
    const tokens = tokenService.generateTokenPair({ sub: '1', email: 'a@a.com' }, csrfConfig);
    const req = createRequest({ cookies: { accessToken: tokens.accessToken, 'csrf-token': 'tok123' } });
    const res = createResponse();
    middleware(req as any, res as any, () => {});
    expect(res.statusCode).toBe(403);
    expect((res.jsonBody as any).code).toBe('CSRF_INVALID');
  });

  it('returns 403 when X-CSRF-Token header does not match cookie', () => {
    const middleware = createAuthMiddleware(csrfConfig);
    const tokens = tokenService.generateTokenPair({ sub: '1', email: 'a@a.com' }, csrfConfig);
    const req = createRequest({
      cookies: { accessToken: tokens.accessToken, 'csrf-token': 'tok123' },
      headers: { 'x-csrf-token': 'wrong-token' },
    });
    const res = createResponse();
    middleware(req as any, res as any, () => {});
    expect(res.statusCode).toBe(403);
    expect((res.jsonBody as any).code).toBe('CSRF_INVALID');
  });

  it('returns 403 when csrf-token cookie is missing', () => {
    const middleware = createAuthMiddleware(csrfConfig);
    const tokens = tokenService.generateTokenPair({ sub: '1', email: 'a@a.com' }, csrfConfig);
    const req = createRequest({
      cookies: { accessToken: tokens.accessToken },
      headers: { 'x-csrf-token': 'tok123' },
    });
    const res = createResponse();
    middleware(req as any, res as any, () => {});
    expect(res.statusCode).toBe(403);
  });

  it('skips CSRF check when csrf is not configured', () => {
    const middleware = createAuthMiddleware(config);
    const tokens = tokenService.generateTokenPair({ sub: '1', email: 'a@a.com' }, config);
    // No csrf-token cookie or header — should still pass
    const req = createRequest({ cookies: { accessToken: tokens.accessToken } });
    const res = createResponse();
    let nextCalled = false;
    middleware(req as any, res as any, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('accepts token from Authorization: Bearer header', () => {
    const middleware = createAuthMiddleware(config);
    const tokens = tokenService.generateTokenPair({ sub: '3', email: 'c@c.com' }, config);
    const req = createRequest({ headers: { authorization: `Bearer ${tokens.accessToken}` } });
    const res = createResponse();
    let nextCalled = false;
    middleware(req as any, res as any, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect((req as any).user.sub).toBe('3');
  });

  it('skips CSRF check for bearer requests even when csrf is enabled', () => {
    const csrfConfig: AuthConfig = { ...config, csrf: { enabled: true } };
    const middleware = createAuthMiddleware(csrfConfig);
    const tokens = tokenService.generateTokenPair({ sub: '1', email: 'a@a.com' }, csrfConfig);
    // No csrf-token cookie or header, but using bearer — should still pass
    const req = createRequest({ headers: { authorization: `Bearer ${tokens.accessToken}` } });
    const res = createResponse();
    let nextCalled = false;
    middleware(req as any, res as any, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });
});

describe('createAuthMiddleware — session store integration', () => {
  function makeSessionStore(session: SessionInfo | null) {
    return {
      createSession: vi.fn(),
      getSession: vi.fn().mockResolvedValue(session),
      getSessionsForUser: vi.fn(),
      updateSessionLastActive: vi.fn().mockResolvedValue(undefined),
      revokeSession: vi.fn(),
      revokeAllSessionsForUser: vi.fn(),
    };
  }

  it('allows request when checkOn=allcalls and session exists', async () => {
    const sessionStore = makeSessionStore({ sessionHandle: 'sid-1', userId: '1', createdAt: new Date(), expiresAt: new Date(Date.now() + 3600_000) });
    const cfg: AuthConfig = { ...config, session: { checkOn: 'allcalls' } };
    const middleware = createAuthMiddleware(cfg, sessionStore as any);
    const tokens = tokenService.generateTokenPair({ sub: '1', email: 'a@a.com', sid: 'sid-1' }, cfg);
    const req = createRequest({ cookies: { accessToken: tokens.accessToken } });
    const res = createResponse();
    let nextCalled = false;
    await (middleware as any)(req as any, res as any, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(sessionStore.getSession).toHaveBeenCalledWith('sid-1');
  });

  it('returns 401 when checkOn=allcalls and session is revoked', async () => {
    const sessionStore = makeSessionStore(null); // session gone
    const cfg: AuthConfig = { ...config, session: { checkOn: 'allcalls' } };
    const middleware = createAuthMiddleware(cfg, sessionStore as any);
    const tokens = tokenService.generateTokenPair({ sub: '1', email: 'a@a.com', sid: 'sid-1' }, cfg);
    const req = createRequest({ cookies: { accessToken: tokens.accessToken } });
    const res = createResponse();
    let nextCalled = false;
    await (middleware as any)(req as any, res as any, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect((res.jsonBody as any).code).toBe('SESSION_REVOKED');
  });

  it('skips getSession when checkOn=refresh (stateless fast-path)', async () => {
    const sessionStore = makeSessionStore(null); // would reject if called
    const cfg: AuthConfig = { ...config, session: { checkOn: 'refresh' } };
    const middleware = createAuthMiddleware(cfg, sessionStore as any);
    const tokens = tokenService.generateTokenPair({ sub: '1', email: 'a@a.com', sid: 'sid-1' }, cfg);
    const req = createRequest({ cookies: { accessToken: tokens.accessToken } });
    const res = createResponse();
    let nextCalled = false;
    await (middleware as any)(req as any, res as any, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(sessionStore.getSession).not.toHaveBeenCalled();
  });

  it('updates lastActiveAt on every authenticated request', async () => {
    const sessionStore = makeSessionStore({ sessionHandle: 'sid-1', userId: '1', createdAt: new Date(), expiresAt: new Date(Date.now() + 3600_000) });
    const cfg: AuthConfig = { ...config, session: { checkOn: 'allcalls' } };
    const middleware = createAuthMiddleware(cfg, sessionStore as any);
    const tokens = tokenService.generateTokenPair({ sub: '1', email: 'a@a.com', sid: 'sid-1' }, cfg);
    const req = createRequest({ cookies: { accessToken: tokens.accessToken } });
    const res = createResponse();
    await (middleware as any)(req as any, res as any, () => {});
    expect(sessionStore.updateSessionLastActive).toHaveBeenCalledWith('sid-1');
  });

  it('updates lastActiveAt even in refresh mode (no blocking check)', async () => {
    const sessionStore = makeSessionStore(null);
    const cfg: AuthConfig = { ...config, session: { checkOn: 'refresh' } };
    const middleware = createAuthMiddleware(cfg, sessionStore as any);
    const tokens = tokenService.generateTokenPair({ sub: '1', email: 'a@a.com', sid: 'sid-1' }, cfg);
    const req = createRequest({ cookies: { accessToken: tokens.accessToken } });
    const res = createResponse();
    let nextCalled = false;
    await (middleware as any)(req as any, res as any, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(sessionStore.updateSessionLastActive).toHaveBeenCalledWith('sid-1');
  });
});
