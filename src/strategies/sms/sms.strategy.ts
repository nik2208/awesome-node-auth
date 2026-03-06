import { IUserStore } from '../../interfaces/user-store.interface';
import { AuthConfig } from '../../models/auth-config.model';
import { SmsService } from '../../services/sms.service';
import { PasswordService } from '../../services/password.service';
import { AuthError } from '../../models/errors';

const passwordService = new PasswordService();

export class SmsStrategy {
  async sendCode(phone: string, userId: string, userStore: IUserStore, config: AuthConfig): Promise<void> {
    if (!config.sms) {
      throw new AuthError('SMS not configured', 'SMS_NOT_CONFIGURED', 500);
    }
    const smsService = new SmsService(config.sms);
    const code = smsService.generateCode();
    const hashedCode = await passwordService.hash(code, 10);
    const expiresInMin = config.sms.codeExpiresInMinutes ?? 10;
    const expiry = new Date(Date.now() + expiresInMin * 60 * 1000);
    await userStore.updateSmsCode(userId, hashedCode, expiry);
    await smsService.sendSms(phone, `Your verification code is: ${code}`);
  }

  async verify(userId: string, code: string, userStore: IUserStore): Promise<boolean> {
    const user = await userStore.findById(userId);
    if (!user) return false;
    if (!user.smsCode) return false;
    if (user.smsCodeExpiry && new Date() > user.smsCodeExpiry) {
      await userStore.updateSmsCode(userId, null, null);
      return false;
    }
    const valid = await passwordService.compare(code, user.smsCode);
    if (valid) {
      await userStore.updateSmsCode(userId, null, null);
    }
    return valid;
  }
}
