import type { EmailTemplate } from "./types.js";

export class TemplateEngine {
  private templates: Map<string, EmailTemplate> = new Map();

  register(template: EmailTemplate): void {
    this.templates.set(template.name, template);
  }

  render(name: string, data: Record<string, string>): string {
    const template = this.templates.get(name);
    if (!template) {
      throw new Error(`Template "${name}" not found`);
    }
    let html = template.htmlBody;
    for (const [key, value] of Object.entries(data)) {
      html = html.replaceAll(`{{${key}}}`, value);
    }
    return html;
  }
}
