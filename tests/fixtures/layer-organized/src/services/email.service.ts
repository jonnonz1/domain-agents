import nodemailer from "nodemailer";
import { EmailLogModel } from "../models/email-log.model";

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }

  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    const log = await EmailLogModel.create({ to, subject, body, status: "queued", scheduledAt: null, sentAt: null } as any);

    try {
      await this.transporter.sendMail({ from: process.env.FROM_EMAIL, to, subject, html: body });
      await log.update({ status: "sent", sentAt: new Date() });
    } catch {
      await log.update({ status: "failed" });
      throw new Error(`Failed to send email to ${to}`);
    }
  }

  async scheduleEmail(to: string, subject: string, body: string, scheduledAt: Date): Promise<void> {
    await EmailLogModel.create({ to, subject, body, status: "queued", scheduledAt, sentAt: null } as any);
  }
}
