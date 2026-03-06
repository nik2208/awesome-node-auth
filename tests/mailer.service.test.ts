import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { MailerService } from '../src/services/mailer.service';
import { MailerConfig } from '../src/models/auth-config.model';

// ---------------------------------------------------------------------------
// Helpers: spin up a tiny local HTTP server to capture requests
// ---------------------------------------------------------------------------

interface CapturedRequest {
  method: string;
  headers: http.IncomingHttpHeaders;
  body: Record<string, unknown>;
}

let capturedRequests: CapturedRequest[] = [];
let testServer: http.Server;
let testPort: number;

function startTestServer(): Promise<void> {
  return new Promise((resolve) => {
    testServer = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
      req.on('end', () => {
        capturedRequests.push({
          method: req.method ?? 'GET',
          headers: req.headers,
          body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {},
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      });
    });
    testServer.listen(0, '127.0.0.1', () => {
      testPort = (testServer.address() as { port: number }).port;
      resolve();
    });
  });
}

function stopTestServer(): Promise<void> {
  return new Promise((resolve) => testServer.close(() => resolve()));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MailerService', () => {
  beforeEach(async () => {
    capturedRequests = [];
    await startTestServer();
  });

  afterEach(async () => {
    await stopTestServer();
  });

  function makeConfig(overrides?: Partial<MailerConfig>): MailerConfig {
    return {
      endpoint: `http://127.0.0.1:${testPort}/send`,
      apiKey: 'test-api-key',
      from: 'noreply@example.com',
      fromName: 'Test App',
      defaultLang: 'en',
      ...overrides,
    };
  }

  it('sends password-reset email in English by default', async () => {
    const mailer = new MailerService(makeConfig());
    await mailer.sendPasswordReset('user@example.com', 'tok123', 'https://app.com/reset?token=tok123');

    expect(capturedRequests).toHaveLength(1);
    const req = capturedRequests[0];
    expect(req.method).toBe('POST');
    expect(req.headers['x-api-key']).toBe('test-api-key');
    expect(req.body['to']).toBe('user@example.com');
    expect(req.body['from']).toBe('noreply@example.com');
    expect(req.body['fromName']).toBe('Test App');
    expect((req.body['subject'] as string).toLowerCase()).toContain('password');
    expect(req.body['html']).toContain('https://app.com/reset?token=tok123');
    expect(req.body['text']).toContain('https://app.com/reset?token=tok123');
  });

  it('sends password-reset email in Italian when lang=it', async () => {
    const mailer = new MailerService(makeConfig());
    await mailer.sendPasswordReset('user@example.com', 'tok', 'https://app.com/reset', 'it');

    const req = capturedRequests[0];
    // Italian subject
    expect(req.body['subject']).toBe('Reimposta la tua password');
    // Italian body contains the verb form
    expect(req.body['html']).toContain('reimpostare');
  });

  it('uses defaultLang from config when no lang override is passed', async () => {
    const mailer = new MailerService(makeConfig({ defaultLang: 'it' }));
    await mailer.sendPasswordReset('user@example.com', 'tok', 'https://app.com/reset');

    const req = capturedRequests[0];
    expect(req.body['subject']).toBe('Reimposta la tua password');
    expect(req.body['html']).toContain('reimpostare');
  });

  it('sends magic-link email', async () => {
    const mailer = new MailerService(makeConfig());
    await mailer.sendMagicLink('user@example.com', 'ml-tok', 'https://app.com/magic?token=ml-tok');

    const req = capturedRequests[0];
    expect(req.body['to']).toBe('user@example.com');
    expect(req.body['html']).toContain('https://app.com/magic?token=ml-tok');
    expect((req.body['subject'] as string).toLowerCase()).toContain('sign-in');
  });

  it('sends magic-link email in Italian', async () => {
    const mailer = new MailerService(makeConfig());
    await mailer.sendMagicLink('user@example.com', 'tok', 'https://app.com/magic', 'it');

    const req = capturedRequests[0];
    expect(req.body['html']).toContain('link di accesso');
  });

  it('sends welcome email with login URL', async () => {
    const mailer = new MailerService(makeConfig());
    await mailer.sendWelcome('new@example.com', { loginUrl: 'https://app.com/login' });

    const req = capturedRequests[0];
    expect(req.body['to']).toBe('new@example.com');
    expect(req.body['html']).toContain('https://app.com/login');
  });

  it('includes temporary password in welcome email when provided', async () => {
    const mailer = new MailerService(makeConfig());
    await mailer.sendWelcome('new@example.com', { loginUrl: 'https://app.com/login', tempPassword: 'Temp@123' });

    const req = capturedRequests[0];
    expect(req.body['html']).toContain('Temp@123');
    expect(req.body['text']).toContain('Temp@123');
  });

  it('sends welcome email in Italian', async () => {
    const mailer = new MailerService(makeConfig());
    await mailer.sendWelcome('new@example.com', { loginUrl: 'https://app.com/login' }, 'it');

    const req = capturedRequests[0];
    expect(req.body['subject']).toContain('Benvenuto');
  });

  it('includes provider in payload when configured', async () => {
    const mailer = new MailerService(makeConfig({ provider: 'example.com' }));
    await mailer.sendPasswordReset('user@example.com', 'tok', 'https://app.com/reset');

    const req = capturedRequests[0];
    expect(req.body['provider']).toBe('example.com');
  });

  it('omits provider from payload when not configured', async () => {
    const mailer = new MailerService(makeConfig());
    await mailer.sendPasswordReset('user@example.com', 'tok', 'https://app.com/reset');

    const req = capturedRequests[0];
    expect(req.body['provider']).toBeUndefined();
  });

  it('rejects on non-2xx response from mailer endpoint', async () => {
    // Override server to return 500
    testServer.close();
    await new Promise<void>((resolve) => {
      testServer = http.createServer((_req, res) => {
        res.writeHead(500);
        res.end();
      });
      testServer.listen(testPort, '127.0.0.1', () => resolve());
    });

    const mailer = new MailerService(makeConfig());
    await expect(
      mailer.sendPasswordReset('user@example.com', 'tok', 'https://app.com/reset')
    ).rejects.toThrow(/500/);
  });
});
