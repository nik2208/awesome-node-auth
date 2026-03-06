import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SmsStrategy } from '../src/strategies/sms/sms.strategy';
import { IUserStore } from '../src/interfaces/user-store.interface';
import { BaseUser } from '../src/models/user.model';
import { AuthConfig } from '../src/models/auth-config.model';
import { PasswordService } from '../src/services/password.service';

const passwordService = new PasswordService();

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
    updateSmsCode: vi.fn().mockResolvedValue(undefined),
  };
}

const config: AuthConfig = {
  accessTokenSecret: 's1',
  refreshTokenSecret: 's2',
  sms: {
    endpoint: 'http://test-sms.example.com/send',
    apiKey: 'key',
    username: 'user',
    password: 'pass',
    codeExpiresInMinutes: 10,
  },
};

describe('SmsStrategy', () => {
  let strategy: SmsStrategy;

  beforeEach(() => {
    strategy = new SmsStrategy();
  });

  it('sends a code and stores hashed version', async () => {
    const user: BaseUser = { id: '1', email: 'user@test.com', phoneNumber: '+1234567890' };
    const store = createMockStore(user);

    // Mock the SmsService.sendSms to avoid network call
    vi.mock('../src/services/sms.service', async (importOriginal) => {
      const actual = await importOriginal() as any;
      return {
        ...actual,
        SmsService: class {
          generateCode() { return '123456'; }
          async sendSms() { return; }
        },
      };
    });

    await strategy.sendCode('+1234567890', '1', store, config);
    expect(store.updateSmsCode).toHaveBeenCalledOnce();
  });

  it('verifies a valid SMS code', async () => {
    const hashedCode = await passwordService.hash('654321', 10);
    const user: BaseUser = {
      id: '1',
      email: 'user@test.com',
      smsCode: hashedCode,
      smsCodeExpiry: new Date(Date.now() + 600000),
    };
    const store = createMockStore(user);
    const result = await strategy.verify('1', '654321', store);
    expect(result).toBe(true);
  });

  it('rejects expired SMS code', async () => {
    const hashedCode = await passwordService.hash('654321', 10);
    const user: BaseUser = {
      id: '1',
      email: 'user@test.com',
      smsCode: hashedCode,
      smsCodeExpiry: new Date(Date.now() - 1000),
    };
    const store = createMockStore(user);
    const result = await strategy.verify('1', '654321', store);
    expect(result).toBe(false);
  });

  it('rejects wrong SMS code', async () => {
    const hashedCode = await passwordService.hash('654321', 10);
    const user: BaseUser = {
      id: '1',
      email: 'user@test.com',
      smsCode: hashedCode,
      smsCodeExpiry: new Date(Date.now() + 600000),
    };
    const store = createMockStore(user);
    const result = await strategy.verify('1', '000000', store);
    expect(result).toBe(false);
  });
});
