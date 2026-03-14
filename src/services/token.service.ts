import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Request, Response } from 'express';
import { AccessTokenPayload, TokenPair } from '../models/token.model';
import { AuthConfig } from '../models/auth-config.model';
import { AuthError } from '../models/errors';

export class TokenService {
  generateTokenPair(payload: AccessTokenPayload, config: AuthConfig): TokenPair {
    // Exclude jwt-managed fields; spread remaining claims (including any custom ones)
    const { iat, exp, ...claims } = payload;
    const accessToken = jwt.sign(
      claims,
      config.accessTokenSecret,
      { expiresIn: config.accessTokenExpiresIn ?? '15m' } as jwt.SignOptions
    );
    const refreshToken = jwt.sign(
      claims,
      config.refreshTokenSecret,
      { expiresIn: config.refreshTokenExpiresIn ?? '7d' } as jwt.SignOptions
    );
    return { accessToken, refreshToken };
  }

  verifyAccessToken(token: string, config: AuthConfig): AccessTokenPayload {
    try {
      const payload = jwt.verify(token, config.accessTokenSecret) as AccessTokenPayload;
      return payload;
    } catch {
      throw new AuthError('Invalid or expired access token', 'INVALID_ACCESS_TOKEN', 401);
    }
  }

  verifyRefreshToken(token: string, config: AuthConfig): AccessTokenPayload {
    try {
      const payload = jwt.verify(token, config.refreshTokenSecret) as AccessTokenPayload;
      return payload;
    } catch {
      throw new AuthError('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN', 401);
    }
  }

  private getCookieName(name: string, config: AuthConfig): string {
    if (!config.cookieOptions?.secure) return name;

    // __Host- needs Secure, Path=/, and NO Domain.
    // We use it if path is '/' (default) and domain is not set.
    const isPathRoot = !config.cookieOptions?.path || config.cookieOptions.path === '/';
    if (isPathRoot && !config.cookieOptions?.domain) {
      return `__Host-${name}`;
    }

    return `__Secure-${name}`;
  }

  setTokenCookies(res: Response, tokens: TokenPair, config: AuthConfig): void {
    const commonOpts = {
      httpOnly: true,
      secure: config.cookieOptions?.secure ?? false,
      sameSite: (config.cookieOptions?.sameSite ?? 'lax') as 'strict' | 'lax' | 'none',
      path: config.cookieOptions?.path ?? '/',
    };

    const setCookie = (name: string, value: string, extraOpts: any = {}) => {
      const finalName = this.getCookieName(name, config);
      const opts = { ...commonOpts, ...extraOpts };
      if (finalName.startsWith('__Host-')) {
        delete opts.domain;
      } else {
        opts.domain = config.cookieOptions?.domain;
      }
      res.cookie(finalName, value, opts);
    };

    setCookie('accessToken', tokens.accessToken, { maxAge: 15 * 60 * 1000 });

    const refreshPath = config.cookieOptions?.refreshTokenPath
      ?? (config.apiPrefix ? `${config.apiPrefix}/refresh` : '/auth/refresh');
    setCookie('refreshToken', tokens.refreshToken, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: refreshPath
    });

    if (config.csrf?.enabled) {
      setCookie('csrf-token', this.generateSecureToken(16), {
        httpOnly: false,
        maxAge: 15 * 60 * 1000
      });
    }
  }

  initCsrfToken(res: Response, config: AuthConfig): void {
    if (!config.csrf?.enabled) return;
    const name = this.getCookieName('csrf-token', config);
    const opts: any = {
      httpOnly: false,
      secure: config.cookieOptions?.secure ?? false,
      sameSite: (config.cookieOptions?.sameSite ?? 'lax') as 'strict' | 'lax' | 'none',
      path: config.cookieOptions?.path ?? '/',
      maxAge: 15 * 60 * 1000,
    };
    if (name.startsWith('__Host-')) {
      delete opts.domain;
    } else {
      opts.domain = config.cookieOptions?.domain;
    }
    res.cookie(name, this.generateSecureToken(16), opts);
  }

  clearTokenCookies(res: Response, config?: AuthConfig): void {
    const commonOpts: any = {
      secure: config?.cookieOptions?.secure ?? false,
      sameSite: (config?.cookieOptions?.sameSite ?? 'lax') as 'strict' | 'lax' | 'none',
      path: config?.cookieOptions?.path ?? '/',
    };

    const clearCookie = (name: string, extraOpts: any = {}) => {
      // For maximum robustness, we try to clear the primary name AND prefixed variants.
      // Cookies are only cleared if BOTH name, path, and domain match exactly.
      const primaryName = this.getCookieName(name, config || {} as AuthConfig);
      const possibleNames = new Set([primaryName, `__Host-${name}`, `__Secure-${name}`, name]);

      for (const finalName of possibleNames) {
        const opts = { ...commonOpts, ...extraOpts };
        if (finalName.startsWith('__Host-')) {
          delete opts.domain;
          opts.path = '/'; // __Host- requires path=/
          opts.secure = true;
        } else {
          opts.domain = config?.cookieOptions?.domain;
        }
        res.clearCookie(finalName, opts);
      }
    };

    clearCookie('accessToken');

    // Mirror the path logic from setTokenCookies so the cookie is found and deleted.
    const refreshPath = config?.cookieOptions?.refreshTokenPath
      ?? (config?.apiPrefix ? `${config?.apiPrefix}/refresh` : '/auth/refresh');
    clearCookie('refreshToken', { path: refreshPath });

    if (config?.csrf?.enabled) {
      clearCookie('csrf-token');
    }
  }

  generateSecureToken(bytes: number = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
  }

  extractTokenFromCookie(req: Request, cookieName: string): string | null {
    // List of possible prefixed names in order of preference
    const possibleNames = [
      `__Host-${cookieName}`,
      `__Secure-${cookieName}`,
      cookieName
    ];

    for (const name of possibleNames) {
      // First try cookie-parser parsed cookies
      if (req.cookies && req.cookies[name]) {
        return req.cookies[name] as string;
      }
    }

    // Fallback: parse raw Cookie header
    const cookieHeader = req.headers?.cookie;
    if (!cookieHeader) return null;
    const cookies = cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
      const [key, ...val] = part.trim().split('=');
      if (key) acc[key.trim()] = decodeURIComponent(val.join('='));
      return acc;
    }, {});

    for (const name of possibleNames) {
      if (cookies[name]) return cookies[name];
    }
    return null;
  }
}
