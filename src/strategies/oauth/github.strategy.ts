import { BaseOAuthStrategy } from '../../abstract/base-oauth-strategy.abstract';
import { BaseUser } from '../../models/user.model';
import { AuthConfig } from '../../models/auth-config.model';
import { AuthError } from '../../models/errors';

export abstract class GithubStrategy<TUser extends BaseUser = BaseUser> extends BaseOAuthStrategy<TUser> {
  name = 'github';

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly callbackUrl: string;

  constructor(config: AuthConfig) {
    super();
    if (!config.oauth?.github) {
      throw new AuthError('GitHub OAuth not configured', 'OAUTH_NOT_CONFIGURED', 500);
    }
    this.clientId = config.oauth.github.clientId;
    this.clientSecret = config.oauth.github.clientSecret;
    this.callbackUrl = config.oauth.github.callbackUrl;
  }

  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.callbackUrl,
      scope: 'user:email',
      ...(state ? { state } : {}),
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  protected async exchangeCodeForTokens(code: string): Promise<{ accessToken: string; idToken?: string }> {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.callbackUrl,
      }),
    });
    if (!res.ok) throw new AuthError('GitHub token exchange failed', 'OAUTH_TOKEN_EXCHANGE_FAILED', 401);
    const data = await res.json() as { access_token: string };
    return { accessToken: data.access_token };
  }

  protected async getUserProfile(accessToken: string): Promise<{ id: string; email: string; emailVerified?: boolean; name?: string; picture?: string }> {
    const [userRes, emailRes] = await Promise.all([
      fetch('https://api.github.com/user', {
        headers: { Authorization: `token ${accessToken}`, Accept: 'application/vnd.github.v3+json' },
      }),
      fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `token ${accessToken}`, Accept: 'application/vnd.github.v3+json' },
      }),
    ]);
    if (!userRes.ok) throw new AuthError('Failed to get GitHub user profile', 'OAUTH_PROFILE_FAILED', 401);
    const user = await userRes.json() as { id: number; login: string; name?: string; avatar_url?: string; email?: string };
    let email = user.email ?? '';
    let emailVerified: boolean | undefined;
    if (!email && emailRes.ok) {
      const emails = await emailRes.json() as Array<{ email: string; primary: boolean; verified: boolean }>;
      const primary = emails.find(e => e.primary && e.verified);
      const primaryEntry = primary ?? emails[0];
      email = primaryEntry?.email ?? '';
      emailVerified = primaryEntry?.verified;
    }
    return { id: String(user.id), email, emailVerified, name: user.name ?? user.login, picture: user.avatar_url };
  }

  async handleCallback(code: string, state?: string): Promise<TUser> {
    const { accessToken } = await this.exchangeCodeForTokens(code);
    const profile = await this.getUserProfile(accessToken);
    return this.findOrCreateUser(profile, state);
  }

  abstract findOrCreateUser(profile: { id: string; email: string; emailVerified?: boolean; name?: string; picture?: string }, state?: string): Promise<TUser>;
}
