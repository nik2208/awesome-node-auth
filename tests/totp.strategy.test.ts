import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TotpStrategy } from '../src/strategies/two-factor/totp.strategy';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import { IUserStore } from '../src/interfaces/user-store.interface';

const totp = new TOTP({ crypto: new NobleCryptoPlugin(), base32: new ScureBase32Plugin() });

function createMockStore(): IUserStore {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    updateRefreshToken: vi.fn(),
    updateResetToken: vi.fn(),
    updatePassword: vi.fn(),
    updateTotpSecret: vi.fn().mockResolvedValue(undefined),
    updateMagicLinkToken: vi.fn(),
    updateSmsCode: vi.fn(),
  };
}

describe('TotpStrategy', () => {
  let strategy: TotpStrategy;

  beforeEach(() => {
    strategy = new TotpStrategy();
  });

  it('generates a secret and otpauth URL', async () => {
    const result = strategy.generateSecret('user@test.com', 'TestApp');
    expect(result.secret).toBeTruthy();
    expect(result.otpauthUrl).toContain('otpauth://totp/');
    const qrCode = await result.qrCode;
    expect(qrCode).toContain('data:image/png;base64,');
  });

  it('verifies a valid TOTP code', async () => {
    const { secret } = strategy.generateSecret('user@test.com');
    const token = await totp.generate({ secret });
    expect(await strategy.verify(token, secret)).toBe(true);
  });

  it('rejects an invalid TOTP code', async () => {
    const { secret } = strategy.generateSecret('user@test.com');
    expect(await strategy.verify('000000', secret)).toBe(false);
  });

  it('enables TOTP for a user', async () => {
    const store = createMockStore();
    const { secret } = strategy.generateSecret('user@test.com');
    await strategy.enable('user1', secret, store);
    expect(store.updateTotpSecret).toHaveBeenCalledWith('user1', secret);
  });

  it('disables TOTP for a user', async () => {
    const store = createMockStore();
    await strategy.disable('user1', store);
    expect(store.updateTotpSecret).toHaveBeenCalledWith('user1', null);
  });
});
