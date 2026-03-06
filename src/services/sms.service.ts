import https from 'https';
import http from 'http';
import { URL } from 'url';

export interface SmsConfig {
  endpoint: string;
  apiKey: string;
  username: string;
  password: string;
  codeExpiresInMinutes?: number;
}

export class SmsService {
  constructor(private readonly config: SmsConfig) {}

  sendSms(phone: string, message: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.config.endpoint);
      url.searchParams.set('username', this.config.username);
      url.searchParams.set('password', this.config.password);
      url.searchParams.set('phone', phone);
      url.searchParams.set('message', message);

      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}?${url.searchParams.toString()}`,
        method: 'GET',
        headers: {
          'X-API-Key': this.config.apiKey,
        },
      };

      const transport = url.protocol === 'https:' ? https : http;
      const req = transport.request(options, (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`SMS send failed with status ${res.statusCode}`));
        }
        res.resume();
      });
      req.on('error', reject);
      req.end();
    });
  }

  generateCode(digits: number = 6): string {
    const max = Math.pow(10, digits);
    const min = Math.pow(10, digits - 1);
    return String(Math.floor(min + Math.random() * (max - min)));
  }
}
