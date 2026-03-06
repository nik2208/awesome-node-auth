import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MagicLinkStrategy } from '../src/strategies/magic-link/magic-link.strategy';
import { IUserStore } from '../src/interfaces/user-store.interface';
import { BaseUser } from '../src/models/user.model';
import { AuthConfig } from '../src/models/auth-config.model';
import { AuthError } from '../src/models/errors';

function createMockStore(user: BaseUser | null, opts: { byToken?: BaseUser | null } = {}): IUserStore & { findByMagicLinkToken: (t: string) => Promise<BaseUser | null> } {
  return {
    findByEmail: vi.fn().mockResolvedValue(user),
    findById: vi.fn().mockResolvedValue(user),
    create: vi.fn(),
    updateRefreshToken: vi.fn(),
    updateResetToken: vi.fn(),
    updatePassword: vi.fn(),
    updateTotpSecret: vi.fn(),
    updateMagicLinkToken: vi.fn().mockResolvedValue(undefined),
    updateSmsCode: vi.fn(),
    findByMagicLinkToken: vi.fn().mockResolvedValue(opts.byToken !== undefined ? opts.byToken : user),
  };
}

describe('MagicLinkStrategy', () => {
  let strategy: MagicLinkStrategy;

  beforeEach(() => {
    strategy = new MagicLinkStrategy();
  });

  it('sends a magic link for existing user', async () => {
    const sendMagicLink = vi.fn().mockResolvedValue(undefined);
    const config: AuthConfig = {
      accessTokenSecret: 's1',
      refreshTokenSecret: 's2',
      email: { sendMagicLink, siteUrl: 'http://localhost' },
    };
    const user: BaseUser = { id: '1', email: 'user@test.com' };
    const store = createMockStore(user);
    await strategy.sendMagicLink('user@test.com', store, config);
    expect(sendMagicLink).toHaveBeenCalledOnce();
    expect(store.updateMagicLinkToken).toHaveBeenCalledOnce();
  });

  it('does not throw if user not found (prevents enumeration)', async () => {
    const sendMagicLink = vi.fn();
    const config: AuthConfig = {
      accessTokenSecret: 's1',
      refreshTokenSecret: 's2',
      email: { sendMagicLink },
    };
    const store = createMockStore(null);
    await expect(strategy.sendMagicLink('unknown@test.com', store, config)).resolves.not.toThrow();
    expect(sendMagicLink).not.toHaveBeenCalled();
  });

  it('verifies a valid magic link token', async () => {
    const expiry = new Date(Date.now() + 60000);
    const user: BaseUser = { id: '1', email: 'user@test.com', magicLinkToken: 'abc', magicLinkTokenExpiry: expiry };
    const store = createMockStore(user, { byToken: user });
    const result = await strategy.verify('abc', store);
    expect(result.id).toBe('1');
    expect(store.updateMagicLinkToken).toHaveBeenCalledWith('1', null, null);
  });

  it('throws on expired magic link', async () => {
    const expiry = new Date(Date.now() - 1000);
    const user: BaseUser = { id: '1', email: 'user@test.com', magicLinkToken: 'abc', magicLinkTokenExpiry: expiry };
    const store = createMockStore(user, { byToken: user });
    await expect(strategy.verify('abc', store)).rejects.toBeInstanceOf(AuthError);
  });

  it('throws if findByMagicLinkToken not implemented', async () => {
    const store = createMockStore(null) as any;
    delete store.findByMagicLinkToken;
    await expect(strategy.verify('token', store)).rejects.toBeInstanceOf(AuthError);
  });
});
