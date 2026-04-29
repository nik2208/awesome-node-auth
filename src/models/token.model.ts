export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role?: string;
  loginProvider?: string;
  isEmailVerified?: boolean;
  isTotpEnabled?: boolean;
  /** Session ID (Handle) for stateful session validation. */
  sid?: string;
  iat?: number;
  exp?: number;
  /** Issuer claim — populated when IdP mode is enabled. */
  iss?: string;
  // Note: `kid` is a JOSE header parameter (RFC 7515 §4.1.4) set via `keyid` in jwt.sign().
  // It lives in the JWT header, not in the payload, and is therefore intentionally absent here.
  /** Any additional custom claims embedded in the JWT. */
  [key: string]: unknown;
}
