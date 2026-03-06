export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role?: string;
  iat?: number;
  exp?: number;
  /** Any additional custom claims embedded in the JWT. */
  [key: string]: unknown;
}
