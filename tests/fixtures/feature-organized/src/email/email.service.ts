import type { EmailResult } from "./types.js";

export class EmailService {
  async sendEmail(to: string, template: string, data: Record<string, string>): Promise<EmailResult> {
    return {
      messageId: `msg_${Date.now()}`,
      status: "sent",
      sentAt: new Date(),
    };
  }

  async scheduleEmail(
    to: string,
    template: string,
    data: Record<string, string>,
    sendAt: Date,
  ): Promise<EmailResult> {
    return {
      messageId: `msg_${Date.now()}`,
      status: "queued",
    };
  }
}
