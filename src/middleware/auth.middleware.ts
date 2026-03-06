import { Request, Response, NextFunction, RequestHandler } from 'express';
import { AuthConfig } from '../models/auth-config.model';
import { AccessTokenPayload } from '../models/token.model';
import { TokenService } from '../services/token.service';

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

const tokenService = new TokenService();

export function createAuthMiddleware(config: AuthConfig): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Prefer Authorization: Bearer header (bearer strategy), fall back to cookie
    const authHeader = req.headers['authorization'];
    let token: string | null = null;
    let usingBearer = false;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
      usingBearer = true;
    } else {
      token = tokenService.extractTokenFromCookie(req, 'accessToken');
    }
    if (!token) {
      res.status(403).json({ error: 'No access token provided' });
      return;
    }
    // CSRF double-submit check only applies to cookie-based auth
    if (!usingBearer && config.csrf?.enabled) {
      const csrfCookie = tokenService.extractTokenFromCookie(req, 'csrf-token');
      const csrfHeader = req.headers['x-csrf-token'] as string | undefined;
      if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
        res.status(403).json({ error: 'CSRF token validation failed', code: 'CSRF_INVALID' });
        return;
      }
    }
    try {
      const payload = tokenService.verifyAccessToken(token, config);
      req.user = payload;
      next();
    } catch {
      res.status(403).json({ error: 'Invalid or expired access token' });
    }
  };
}
