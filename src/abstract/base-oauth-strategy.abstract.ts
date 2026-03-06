import { AuthConfig } from '../models/auth-config.model';
import { BaseUser } from '../models/user.model';
import { BaseAuthStrategy } from './base-auth-strategy.abstract';

export abstract class BaseOAuthStrategy<TUser extends BaseUser = BaseUser> extends BaseAuthStrategy<{ code: string; state?: string }, TUser> {
  abstract name: string;

  abstract getAuthorizationUrl(state?: string): string;
  abstract handleCallback(code: string, state?: string): Promise<TUser>;
  protected abstract exchangeCodeForTokens(code: string): Promise<{ accessToken: string; idToken?: string }>;
  protected abstract getUserProfile(accessToken: string): Promise<{ id: string; email: string; emailVerified?: boolean; name?: string; picture?: string }>;

  async authenticate(input: { code: string; state?: string }, _config: AuthConfig): Promise<TUser> {
    return this.handleCallback(input.code, input.state);
  }
}
