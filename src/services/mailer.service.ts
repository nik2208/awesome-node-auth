import https from 'https';
import http from 'http';
import { URL } from 'url';
import { MailerConfig } from '../models/auth-config.model';

// ---------------------------------------------------------------------------
// Built-in email templates (en / it)
// ---------------------------------------------------------------------------

type Lang = 'en' | 'it';

interface TemplateData {
  subject: string;
  html: string;
  text: string;
}

function passwordResetTemplate(link: string, lang: Lang): TemplateData {
  if (lang === 'it') {
    return {
      subject: 'Reimposta la tua password',
      html: `<p>Hai richiesto di reimpostare la tua password.</p>
<p>Clicca sul link seguente per procedere (valido 1 ora):</p>
<p><a href="${link}">${link}</a></p>
<p>Se non hai richiesto questo, ignora questa email.</p>`,
      text: `Hai richiesto di reimpostare la tua password.\n\nClicca sul link seguente (valido 1 ora):\n${link}\n\nSe non hai richiesto questo, ignora questa email.`,
    };
  }
  return {
    subject: 'Reset your password',
    html: `<p>You requested a password reset.</p>
<p>Click the link below to proceed (valid for 1 hour):</p>
<p><a href="${link}">${link}</a></p>
<p>If you did not request this, please ignore this email.</p>`,
    text: `You requested a password reset.\n\nClick the link below (valid for 1 hour):\n${link}\n\nIf you did not request this, please ignore this email.`,
  };
}

function magicLinkTemplate(link: string, lang: Lang): TemplateData {
  if (lang === 'it') {
    return {
      subject: 'Il tuo link di accesso',
      html: `<p>Hai richiesto un link di accesso.</p>
<p>Clicca sul link seguente per accedere (valido 15 minuti):</p>
<p><a href="${link}">${link}</a></p>
<p>Se non hai richiesto questo, ignora questa email.</p>`,
      text: `Hai richiesto un link di accesso.\n\nClicca sul link seguente (valido 15 minuti):\n${link}\n\nSe non hai richiesto questo, ignora questa email.`,
    };
  }
  return {
    subject: 'Your magic sign-in link',
    html: `<p>You requested a sign-in link.</p>
<p>Click the link below to sign in (valid for 15 minutes):</p>
<p><a href="${link}">${link}</a></p>
<p>If you did not request this, please ignore this email.</p>`,
    text: `You requested a sign-in link.\n\nClick the link below (valid for 15 minutes):\n${link}\n\nIf you did not request this, please ignore this email.`,
  };
}

function welcomeTemplate(data: Record<string, unknown>, lang: Lang): TemplateData {
  const loginUrl = (data['loginUrl'] as string | undefined) ?? '';
  const tempPassword = data['tempPassword'] as string | undefined;

  if (lang === 'it') {
    const passwordLine = tempPassword
      ? `<p>Password temporanea: <strong>${tempPassword}</strong></p>`
      : '';
    const passwordText = tempPassword ? `Password temporanea: ${tempPassword}\n` : '';
    return {
      subject: 'Benvenuto! Il tuo account è stato creato',
      html: `<p>Il tuo account è stato creato con successo.</p>
${passwordLine}
<p>Accedi qui: <a href="${loginUrl}">${loginUrl}</a></p>`,
      text: `Il tuo account è stato creato con successo.\n${passwordText}Accedi qui: ${loginUrl}`,
    };
  }
  const passwordLine = tempPassword
    ? `<p>Temporary password: <strong>${tempPassword}</strong></p>`
    : '';
  const passwordText = tempPassword ? `Temporary password: ${tempPassword}\n` : '';
  return {
    subject: 'Welcome! Your account has been created',
    html: `<p>Your account has been created successfully.</p>
${passwordLine}
<p>Sign in here: <a href="${loginUrl}">${loginUrl}</a></p>`,
    text: `Your account has been created successfully.\n${passwordText}Sign in here: ${loginUrl}`,
  };
}

function verificationEmailTemplate(link: string, lang: Lang): TemplateData {
  if (lang === 'it') {
    return {
      subject: 'Verifica il tuo indirizzo email',
      html: `<p>Grazie per esserti registrato.</p>
<p>Clicca sul link seguente per verificare il tuo indirizzo email (valido 24 ore):</p>
<p><a href="${link}">${link}</a></p>
<p>Se non hai creato un account, ignora questa email.</p>`,
      text: `Grazie per esserti registrato.\n\nClicca sul link seguente per verificare il tuo indirizzo email (valido 24 ore):\n${link}\n\nSe non hai creato un account, ignora questa email.`,
    };
  }
  return {
    subject: 'Verify your email address',
    html: `<p>Thank you for signing up.</p>
<p>Click the link below to verify your email address (valid for 24 hours):</p>
<p><a href="${link}">${link}</a></p>
<p>If you did not create an account, please ignore this email.</p>`,
    text: `Thank you for signing up.\n\nClick the link below to verify your email address (valid for 24 hours):\n${link}\n\nIf you did not create an account, please ignore this email.`,
  };
}

function emailChangedTemplate(newEmail: string, lang: Lang): TemplateData {
  if (lang === 'it') {
    return {
      subject: 'Il tuo indirizzo email è stato aggiornato',
      html: `<p>Questo è un avviso che il tuo indirizzo email è stato aggiornato a <strong>${newEmail}</strong>.</p>
<p>Se non hai richiesto questa modifica, contatta immediatamente il supporto.</p>`,
      text: `Il tuo indirizzo email è stato aggiornato a ${newEmail}.\n\nSe non hai richiesto questa modifica, contatta immediatamente il supporto.`,
    };
  }
  return {
    subject: 'Your email address has been updated',
    html: `<p>This is a notice that your email address has been updated to <strong>${newEmail}</strong>.</p>
<p>If you did not request this change, please contact support immediately.</p>`,
    text: `Your email address has been updated to ${newEmail}.\n\nIf you did not request this change, please contact support immediately.`,
  };
}

// ---------------------------------------------------------------------------
// MailerService
// ---------------------------------------------------------------------------

interface MailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
  from: string;
  fromName?: string;
  provider?: string;
}

export class MailerService {
  constructor(private readonly config: MailerConfig) {}

  // ---- Public helpers -------------------------------------------------------

  async sendPasswordReset(to: string, _token: string, link: string, lang?: string): Promise<void> {
    const l = this.resolveLang(lang);
    const tpl = passwordResetTemplate(link, l);
    await this.send({ to, ...tpl, from: this.config.from, fromName: this.config.fromName, provider: this.config.provider });
  }

  async sendMagicLink(to: string, _token: string, link: string, lang?: string): Promise<void> {
    const l = this.resolveLang(lang);
    const tpl = magicLinkTemplate(link, l);
    await this.send({ to, ...tpl, from: this.config.from, fromName: this.config.fromName, provider: this.config.provider });
  }

  async sendWelcome(to: string, data: Record<string, unknown>, lang?: string): Promise<void> {
    const l = this.resolveLang(lang);
    const tpl = welcomeTemplate(data, l);
    await this.send({ to, ...tpl, from: this.config.from, fromName: this.config.fromName, provider: this.config.provider });
  }

  async sendVerificationEmail(to: string, _token: string, link: string, lang?: string): Promise<void> {
    const l = this.resolveLang(lang);
    const tpl = verificationEmailTemplate(link, l);
    await this.send({ to, ...tpl, from: this.config.from, fromName: this.config.fromName, provider: this.config.provider });
  }

  async sendEmailChanged(to: string, newEmail: string, lang?: string): Promise<void> {
    const l = this.resolveLang(lang);
    const tpl = emailChangedTemplate(newEmail, l);
    await this.send({ to, ...tpl, from: this.config.from, fromName: this.config.fromName, provider: this.config.provider });
  }

  // ---- Transport ------------------------------------------------------------

  private resolveLang(lang?: string): Lang {
    if (lang === 'it') return 'it';
    if (lang === 'en') return 'en';
    return this.config.defaultLang ?? 'en';
  }

  private send(payload: MailPayload): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.config.endpoint);
      const body = JSON.stringify(payload);

      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + (url.search || ''),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-API-Key': this.config.apiKey,
        },
      };

      const transport = url.protocol === 'https:' ? https : http;
      const req = transport.request(options, (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Mailer request failed with status ${res.statusCode}`));
        }
        res.resume();
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}
