/**
 * Tests for ITemplateStore, MailTemplate, UiTranslation interfaces and
 * the MemoryTemplateStore in-memory implementation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { ITemplateStore, MailTemplate, UiTranslation } from '../src/index';
import { MemoryTemplateStore } from '../src/index';

// ---------------------------------------------------------------------------
// MemoryTemplateStore tests
// ---------------------------------------------------------------------------

describe('MemoryTemplateStore', () => {
  let store: ITemplateStore;

  beforeEach(() => {
    store = new MemoryTemplateStore();
  });

  // ---- Mail templates -------------------------------------------------------

  it('returns null for a missing mail template', async () => {
    const result = await store.getMailTemplate('nonexistent');
    expect(result).toBeNull();
  });

  it('creates and retrieves a mail template', async () => {
    await store.updateMailTemplate('magic-link', {
      baseHtml: '<p>Click {{T.link}}</p>',
      baseText: 'Click {{T.link}}',
      translations: { en: { link: 'Click here' }, it: { link: 'Clicca qui' } },
    });

    const tpl = await store.getMailTemplate('magic-link');
    expect(tpl).not.toBeNull();
    expect(tpl!.id).toBe('magic-link');
    expect(tpl!.baseHtml).toBe('<p>Click {{T.link}}</p>');
    expect(tpl!.baseText).toBe('Click {{T.link}}');
    expect(tpl!.translations['en']['link']).toBe('Click here');
    expect(tpl!.translations['it']['link']).toBe('Clicca qui');
  });

  it('updates a mail template partially', async () => {
    await store.updateMailTemplate('welcome', {
      baseHtml: '<p>Welcome!</p>',
      baseText: 'Welcome!',
      translations: {},
    });

    await store.updateMailTemplate('welcome', { baseText: 'Welcome, friend!' });

    const tpl = await store.getMailTemplate('welcome');
    expect(tpl!.baseHtml).toBe('<p>Welcome!</p>');
    expect(tpl!.baseText).toBe('Welcome, friend!');
  });

  it('lists all mail templates', async () => {
    expect(await store.listMailTemplates()).toHaveLength(0);

    await store.updateMailTemplate('magic-link', { baseHtml: '', baseText: '', translations: {} });
    await store.updateMailTemplate('password-reset', { baseHtml: '', baseText: '', translations: {} });

    const list: MailTemplate[] = await store.listMailTemplates();
    expect(list).toHaveLength(2);
    expect(list.map((t) => t.id).sort()).toEqual(['magic-link', 'password-reset']);
  });

  // ---- UI translations -------------------------------------------------------

  it('returns null for missing UI translations', async () => {
    const result = await store.getUiTranslations('login');
    expect(result).toBeNull();
  });

  it('creates and retrieves UI translations', async () => {
    await store.updateUiTranslations('login', {
      en: { title: 'Sign in', submit: 'Log in' },
      it: { title: 'Accedi', submit: 'Entra' },
    });

    const t = await store.getUiTranslations('login');
    expect(t).not.toBeNull();
    expect(t!.page).toBe('login');
    expect(t!.translations['en']['title']).toBe('Sign in');
    expect(t!.translations['it']['submit']).toBe('Entra');
  });

  it('overwrites UI translations for a page', async () => {
    await store.updateUiTranslations('register', { en: { title: 'Register' } });
    await store.updateUiTranslations('register', { en: { title: 'Create account' } });

    const t = await store.getUiTranslations('register');
    expect(t!.translations['en']['title']).toBe('Create account');
  });

  it('lists all UI translations', async () => {
    expect(await store.listUiTranslations()).toHaveLength(0);

    await store.updateUiTranslations('login', { en: { title: 'Sign in' } });
    await store.updateUiTranslations('register', { en: { title: 'Register' } });

    const list: UiTranslation[] = await store.listUiTranslations();
    expect(list).toHaveLength(2);
    expect(list.map((t) => t.page).sort()).toEqual(['login', 'register']);
  });
});
