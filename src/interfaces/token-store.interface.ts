export interface ITokenStore {
  saveRefreshToken(userId: string, token: string, expiry: Date): Promise<void>;
  findRefreshToken(token: string): Promise<{ userId: string; expiry: Date } | null>;
  deleteRefreshToken(token: string): Promise<void>;
  deleteAllUserTokens(userId: string): Promise<void>;
}
