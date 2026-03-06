import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalStrategy } from '../src/strategies/local/local.strategy';
import { PasswordService } from '../src/services/password.service';
import { AuthConfig } from '../src/models/auth-config.model';
import { IUserStore } from '../src/interfaces/user-store.interface';
import { BaseUser } from '../src/models/user.model';
import { AuthError } from '../src/models/errors';

const config: AuthConfig = {
  accessTokenSecret: 'sec',
  refreshTokenSecret: 'sec2',
};

function createMockStore(user: BaseUser | null): IUserStore {
  return {
    findByEmail: vi.fn().mockResolvedValue(user),
    findById: vi.fn().mockResolvedValue(user),
    create: vi.fn(),
    updateRefreshToken: vi.fn(),
    updateResetToken: vi.fn(),
    updatePassword: vi.fn(),
    updateTotpSecret: vi.fn(),
    updateMagicLinkToken: vi.fn(),
    updateSmsCode: vi.fn(),
  };
}

describe('LocalStrategy', () => {
  let passwordService: PasswordService;

  beforeEach(() => {
    passwordService = new PasswordService();
  });

  it('authenticates valid credentials', async () => {
    const hash = await passwordService.hash('password123');
    const user: BaseUser = { id: '1', email: 'user@test.com', password: hash };
    const store = createMockStore(user);
    const strategy = new LocalStrategy(store, passwordService);
    const result = await strategy.authenticate({ email: 'user@test.com', password: 'password123' }, config);
    expect(result.id).toBe('1');
  });

  it('throws on user not found', async () => {
    const store = createMockStore(null);
    const strategy = new LocalStrategy(store, passwordService);
    await expect(strategy.authenticate({ email: 'no@one.com', password: 'pass' }, config))
      .rejects.toBeInstanceOf(AuthError);
  });

  it('throws on wrong password', async () => {
    const hash = await passwordService.hash('correct');
    const user: BaseUser = { id: '1', email: 'user@test.com', password: hash };
    const store = createMockStore(user);
    const strategy = new LocalStrategy(store, passwordService);
    await expect(strategy.authenticate({ email: 'user@test.com', password: 'wrong' }, config))
      .rejects.toBeInstanceOf(AuthError);
  });

  it('throws EMAIL_NOT_VERIFIED when requireEmailVerification is true and email not verified', async () => {
    const hash = await passwordService.hash('password123');
    const user: BaseUser = { id: '1', email: 'user@test.com', password: hash, isEmailVerified: false };
    const store = createMockStore(user);
    const strategy = new LocalStrategy(store, passwordService);
    const cfgWithVerification: AuthConfig = { ...config, requireEmailVerification: true };
    const err = await strategy.authenticate({ email: 'user@test.com', password: 'password123' }, cfgWithVerification)
      .catch(e => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).code).toBe('EMAIL_NOT_VERIFIED');
    expect((err as AuthError).statusCode).toBe(403);
  });

  it('allows login when requireEmailVerification is true and email is verified', async () => {
    const hash = await passwordService.hash('password123');
    const user: BaseUser = { id: '1', email: 'user@test.com', password: hash, isEmailVerified: true };
    const store = createMockStore(user);
    const strategy = new LocalStrategy(store, passwordService);
    const cfgWithVerification: AuthConfig = { ...config, requireEmailVerification: true };
    const result = await strategy.authenticate({ email: 'user@test.com', password: 'password123' }, cfgWithVerification);
    expect(result.id).toBe('1');
  });

  it('allows login when requireEmailVerification is false even if email not verified', async () => {
    const hash = await passwordService.hash('password123');
    const user: BaseUser = { id: '1', email: 'user@test.com', password: hash, isEmailVerified: false };
    const store = createMockStore(user);
    const strategy = new LocalStrategy(store, passwordService);
    const cfgNoVerification: AuthConfig = { ...config, requireEmailVerification: false };
    const result = await strategy.authenticate({ email: 'user@test.com', password: 'password123' }, cfgNoVerification);
    expect(result.id).toBe('1');
  });
});
