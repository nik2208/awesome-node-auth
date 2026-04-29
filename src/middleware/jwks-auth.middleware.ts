import { Request, Response, NextFunction, RequestHandler } from 'express';
import { AuthConfig } from '../models/auth-config.model';
import { TokenService } from '../services/token.service';
import { JwksService, JwksClient } from '../services/jwks.service';

const tokenService = new TokenService();

// Module-level cache: one JwksClient per JWKS URL so the key cache is shared
// across requests even when `createJwksAuthMiddleware` is called multiple times.
const clientCache = new Map<string, JwksClient>();

function getOrCreateClient(config: AuthConfig): JwksClient {
  const rs = config.resourceServer!;
  const existing = clientCache.get(rs.jwksUrl);
  if (existing) return existing;

  const client = JwksService.createRemoteClient(rs.jwksUrl, {
    cacheTtl: rs.jwksCacheTtl,
    fetchTimeout: rs.jwksFetchTimeout,
  });
  clientCache.set(rs.jwksUrl, client);
  return client;
}

/**
 * Auth middleware for Resource Server mode.
 *
 * Validates incoming Bearer tokens against the remote JWKS endpoint configured
 * in `config.resourceServer`. Cookie-based auth (using `accessTokenSecret` /
 * HS256) is also supported as a fallback for SSR pages on the dashboard itself.
 *
 * Usage:
 * ```ts
 * app.use(createJwksAuthMiddleware(config));
 * ```
 */
export function createJwksAuthMiddleware(config: AuthConfig): RequestHandler {
  if (!config.resourceServer?.enabled) {
    throw new Error('createJwksAuthMiddleware requires config.resourceServer.enabled = true');
  }

  const jwksClient = getOrCreateClient(config);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

    try {
      if (usingBearer) {
        // Bearer tokens are validated against the remote JWKS (RS256)
        const payload = await tokenService.verifyWithJwks(
          token,
          jwksClient,
          config.resourceServer!.issuer,
        );
        req.user = payload;
      } else {
        // Cookie-based tokens use the local HS256 secret (SSR / dashboard session)
        const payload = tokenService.verifyAccessToken(token, config);
        req.user = payload;
      }
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired access token', code: 'INVALID_TOKEN' });
    }
  };
}

/** Exported for testing: clear the module-level JWKS client cache. */
export function _clearJwksClientCache(): void {
  clientCache.clear();
}
