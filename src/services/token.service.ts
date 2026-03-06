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

  setTokenCookies(res: Response, tokens: TokenPair, config: AuthConfig): void {
    const cookieOpts = {
      httpOnly: true,
      secure: config.cookieOptions?.secure ?? false,
      sameSite: (config.cookieOptions?.sameSite ?? 'lax') as 'strict' | 'lax' | 'none',
      domain: config.cookieOptions?.domain,
    };
    res.cookie('accessToken', tokens.accessToken, {
      ...cookieOpts,
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('refreshToken', tokens.refreshToken, {
      ...cookieOpts,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: config.cookieOptions?.refreshTokenPath ?? '/',
    });
    if (config.csrf?.enabled) {
      // Double-submit cookie: non-HttpOnly so JS can read it and send as X-CSRF-Token header.
      // 16 bytes (128 bits) is the OWASP-recommended minimum entropy for CSRF tokens.
      res.cookie('csrf-token', this.generateSecureToken(16), {
        httpOnly: false,
        secure: config.cookieOptions?.secure ?? false,
        sameSite: (config.cookieOptions?.sameSite ?? 'lax') as 'strict' | 'lax' | 'none',
        domain: config.cookieOptions?.domain,
        maxAge: 15 * 60 * 1000,
      });
    }
  }

  initCsrfToken(res: Response, config: AuthConfig): void {
    if (!config.csrf?.enabled) return;
    res.cookie('csrf-token', this.generateSecureToken(16), {
      httpOnly: false,
      secure: config.cookieOptions?.secure ?? false,
      sameSite: (config.cookieOptions?.sameSite ?? 'lax') as 'strict' | 'lax' | 'none',
      domain: config.cookieOptions?.domain,
      maxAge: 15 * 60 * 1000,
    });
  }

  clearTokenCookies(res: Response, config?: AuthConfig): void {
    const opts = {
      secure: config?.cookieOptions?.secure ?? false,
      sameSite: (config?.cookieOptions?.sameSite ?? 'lax') as 'strict' | 'lax' | 'none',
      domain: config?.cookieOptions?.domain,
    };
    res.clearCookie('accessToken', opts);
    res.clearCookie('refreshToken', {
      ...opts,
      path: config?.cookieOptions?.refreshTokenPath ?? '/',
    });
    if (config?.csrf?.enabled) {
      res.clearCookie('csrf-token', opts);
    }
  }

  generateSecureToken(bytes: number = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
  }

  extractTokenFromCookie(req: Request, cookieName: string): string | null {
    // First try cookie-parser parsed cookies
    if (req.cookies && req.cookies[cookieName]) {
      return req.cookies[cookieName] as string;
    }
    // Fallback: parse raw Cookie header
    const cookieHeader = req.headers?.cookie;
    if (!cookieHeader) return null;
    const cookies = cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
      const [key, ...val] = part.trim().split('=');
      if (key) acc[key.trim()] = decodeURIComponent(val.join('='));
      return acc;
    }, {});
    return cookies[cookieName] ?? null;
  }
}
