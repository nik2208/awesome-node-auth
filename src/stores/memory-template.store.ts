import { ITemplateStore, MailTemplate, UiTranslation } from '../interfaces/template-store.interface';

export class MemoryTemplateStore implements ITemplateStore {
    private mailTemplates: Map<string, MailTemplate> = new Map();
    private uiTranslations: Map<string, UiTranslation> = new Map();

    async getMailTemplate(id: string): Promise<MailTemplate | null> {
        return this.mailTemplates.get(id) || null;
    }

    async listMailTemplates(): Promise<MailTemplate[]> {
        return Array.from(this.mailTemplates.values());
    }

    async updateMailTemplate(id: string, template: Partial<MailTemplate>): Promise<void> {
        const existing = this.mailTemplates.get(id) || {
            id,
            baseHtml: '',
            baseText: '',
            translations: {}
        };
        this.mailTemplates.set(id, { ...existing, ...template });
    }

    async getUiTranslations(page: string): Promise<UiTranslation | null> {
        return this.uiTranslations.get(page) || null;
    }

    async listUiTranslations(): Promise<UiTranslation[]> {
        return Array.from(this.uiTranslations.values());
    }

    async updateUiTranslations(page: string, translations: Record<string, Record<string, string>>): Promise<void> {
        this.uiTranslations.set(page, { page, translations });
    }
}
