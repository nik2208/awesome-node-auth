export interface MailTemplate {
    id: string; // e.g. 'magic-link', 'welcome', 'password-reset', 'invitation'
    baseHtml: string; // The HTML structure with placeholders like {{T.subject}}
    baseText: string; // The text structure
    translations: Record<string, Record<string, string>>; // lang -> { key: value }
}

export interface UiTranslation {
    page: string; // e.g. 'login', 'register', 'verify-email', 'forgot-password'
    translations: Record<string, Record<string, string>>; // lang -> { key: value }
}

export interface ITemplateStore {
    /**
     * Get a mail template by ID.
     */
    getMailTemplate(id: string): Promise<MailTemplate | null>;

    /**
     * List all mail templates.
     */
    listMailTemplates(): Promise<MailTemplate[]>;

    /**
     * Update or create a mail template.
     */
    updateMailTemplate(id: string, template: Partial<MailTemplate>): Promise<void>;

    /**
     * Get UI translations for a specific page.
     */
    getUiTranslations(page: string): Promise<UiTranslation | null>;

    /**
     * List all UI translations.
     */
    listUiTranslations(): Promise<UiTranslation[]>;

    /**
     * Update or create UI translations for a page.
     */
    updateUiTranslations(page: string, translations: Record<string, Record<string, string>>): Promise<void>;
}
