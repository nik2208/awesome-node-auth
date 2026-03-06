import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import qrcode from 'qrcode';
import { IUserStore } from '../../interfaces/user-store.interface';

const totp = new TOTP({
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
});

export class TotpStrategy {
  generateSecret(email: string, appName: string = 'awesome-node-auth'): {
    secret: string;
    otpauthUrl: string;
    qrCode: Promise<string>;
  } {
    const secret = totp.generateSecret();
    const otpauthUrl = totp.toURI({ label: email, issuer: appName, secret });
    const qrCode = qrcode.toDataURL(otpauthUrl);
    return { secret, otpauthUrl, qrCode };
  }

  async verify(token: string, secret: string): Promise<boolean> {
    const result = await totp.verify(token, { secret });
    return result.valid;
  }

  async enable(userId: string, secret: string, userStore: IUserStore): Promise<void> {
    await userStore.updateTotpSecret(userId, secret);
  }

  async disable(userId: string, userStore: IUserStore): Promise<void> {
    await userStore.updateTotpSecret(userId, null);
  }
}
