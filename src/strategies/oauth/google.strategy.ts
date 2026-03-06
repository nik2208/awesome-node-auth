import { BaseOAuthStrategy } from '../../abstract/base-oauth-strategy.abstract';
import { BaseUser } from '../../models/user.model';
import { AuthConfig } from '../../models/auth-config.model';
import { AuthError } from '../../models/errors';

export abstract class GoogleStrategy<TUser extends BaseUser = BaseUser> extends BaseOAuthStrategy<TUser> {
  name = 'google';

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly callbackUrl: string;

  constructor(config: AuthConfig) {
    super();
    if (!config.oauth?.google) {
      throw new AuthError('Google OAuth not configured', 'OAUTH_NOT_CONFIGURED', 500);
    }
    this.clientId = config.oauth.google.clientId;
    this.clientSecret = config.oauth.google.clientSecret;
    this.callbackUrl = config.oauth.google.callbackUrl;
  }

  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      ...(state ? { state } : {}),
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  protected async exchangeCodeForTokens(code: string): Promise<{ accessToken: string; idToken?: string }> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.callbackUrl,
        grant_type: 'authorization_code',
      }).toString(),
    });
    if (!res.ok) throw new AuthError('Google token exchange failed', 'OAUTH_TOKEN_EXCHANGE_FAILED', 401);
    const data = await res.json() as { access_token: string; id_token?: string };
    return { accessToken: data.access_token, idToken: data.id_token };
  }

  protected async getUserProfile(accessToken: string): Promise<{ id: string; email: string; emailVerified?: boolean; name?: string; picture?: string }> {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new AuthError('Failed to get Google user profile', 'OAUTH_PROFILE_FAILED', 401);
    const data = await res.json() as { sub: string; email: string; email_verified?: boolean; name?: string; picture?: string };
    return { id: data.sub, email: data.email, emailVerified: data.email_verified, name: data.name, picture: data.picture };
  }

  async handleCallback(code: string, state?: string): Promise<TUser> {
    const { accessToken } = await this.exchangeCodeForTokens(code);
    const profile = await this.getUserProfile(accessToken);
    return this.findOrCreateUser(profile, state);
  }

  abstract findOrCreateUser(profile: { id: string; email: string; emailVerified?: boolean; name?: string; picture?: string }, state?: string): Promise<TUser>;
}
