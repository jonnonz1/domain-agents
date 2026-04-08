export interface EmailOptions {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}

export interface EmailTemplate {
  name: string;
  subject: string;
  htmlBody: string;
}

export interface EmailResult {
  messageId: string;
  status: "sent" | "queued" | "failed";
  sentAt?: Date;
}
