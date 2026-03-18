import { Request, Response, NextFunction, RequestHandler } from 'express';
import { AuthConfig } from '../models/auth-config.model';
import { AccessTokenPayload } from '../models/token.model';
import { TokenService } from '../services/token.service';
import { ISessionStore } from '../interfaces/session-store.interface';

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

const tokenService = new TokenService();

export function createAuthMiddleware(config: AuthConfig, sessionStore?: ISessionStore): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
    // CSRF double-submit check only applies to cookie-based auth and state-changing methods
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (!usingBearer && config.csrf?.enabled && !safeMethods.includes(req.method)) {
      const csrfCookie = tokenService.extractTokenFromCookie(req, 'csrf-token');
      const csrfHeader = req.headers['x-csrf-token'] as string | undefined;
      if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
        res.status(403).json({ error: 'CSRF token validation failed', code: 'CSRF_INVALID' });
        return;
      }
    }
    try {
      const payload = tokenService.verifyAccessToken(token, config);
      
      // Optional Real-time Session Validation
      if (sessionStore && payload.sid && config.session?.checkOn === 'allcalls') {
        const session = await sessionStore.getSession(payload.sid);
        if (!session) {
          res.status(401).json({ error: 'Session has been revoked', code: 'SESSION_REVOKED' });
          return;
        }
      }

      // Update activity timestamp if session management is active (even in 'refresh' or 'none' mode for visibility)
      if (sessionStore && payload.sid) {
        await sessionStore.updateSessionLastActive(payload.sid).catch(() => {});
      }

      req.user = payload;
      next();
    } catch {
      res.status(403).json({ error: 'Invalid or expired access token' });
    }
  };
}
