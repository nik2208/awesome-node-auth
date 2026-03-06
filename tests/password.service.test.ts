import { describe, it, expect, beforeEach } from 'vitest';
import { PasswordService } from '../src/services/password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService();
  });

  it('hashes a password', async () => {
    const hash = await service.hash('mypassword');
    expect(hash).not.toBe('mypassword');
    expect(hash.startsWith('$2')).toBe(true);
  });

  it('compares password correctly', async () => {
    const hash = await service.hash('correctpass');
    expect(await service.compare('correctpass', hash)).toBe(true);
    expect(await service.compare('wrongpass', hash)).toBe(false);
  });

  it('uses custom salt rounds', async () => {
    const hash = await service.hash('password', 6);
    expect(await service.compare('password', hash)).toBe(true);
  });
});
