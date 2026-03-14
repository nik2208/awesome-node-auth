import { IUserStore } from '../../interfaces/user-store.interface';
import { AuthConfig } from '../../models/auth-config.model';
import { BaseUser } from '../../models/user.model';
import { TokenService } from '../../services/token.service';
import { MailerService } from '../../services/mailer.service';
import { AuthError } from '../../models/errors';

const tokenService = new TokenService();

export class MagicLinkStrategy {
  async sendMagicLink(email: string, userStore: IUserStore, config: AuthConfig, lang?: string, siteUrlOverride?: string): Promise<void> {
    if (!config.email?.sendMagicLink && !config.email?.mailer) {
      throw new AuthError('Email not configured', 'EMAIL_NOT_CONFIGURED', 500);
    }
    const user = await userStore.findByEmail(email);
    if (!user) {
      // Don't reveal whether email exists
      return;
    }
    const token = tokenService.generateSecureToken();
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min
    await userStore.updateMagicLinkToken(user.id, token, expiry);
    const siteUrlCfg = config.email?.siteUrl;
    const defaultSiteUrl = Array.isArray(siteUrlCfg) ? (siteUrlCfg[0] ?? '') : (siteUrlCfg ?? '');
    const basePath = siteUrlOverride || `${defaultSiteUrl}/auth`;
    const cleanBasePath = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
    const link = `${cleanBasePath}/magic-link/verify?token=${token}`;
    if (config.email?.sendMagicLink) {
      await config.email.sendMagicLink(email, token, link, lang);
    } else if (config.email?.mailer) {
      const mailer = new MailerService(config.email.mailer);
      await mailer.sendMagicLink(email, token, link, lang);
    }
  }

  async verify(token: string, userStore: IUserStore): Promise<BaseUser> {
    if (!userStore.findByMagicLinkToken) {
      throw new AuthError('UserStore does not implement findByMagicLinkToken', 'NOT_IMPLEMENTED', 500);
    }
    const user = await userStore.findByMagicLinkToken(token);
    if (!user) {
      throw new AuthError('Invalid magic link token', 'INVALID_MAGIC_LINK', 401);
    }
    if (!user.magicLinkToken || user.magicLinkToken !== token) {
      throw new AuthError('Invalid magic link token', 'INVALID_MAGIC_LINK', 401);
    }
    if (user.magicLinkTokenExpiry && new Date() > user.magicLinkTokenExpiry) {
      throw new AuthError('Magic link token has expired', 'MAGIC_LINK_EXPIRED', 401);
    }
    await userStore.updateMagicLinkToken(user.id, null, null);
    return user;
  }
}
