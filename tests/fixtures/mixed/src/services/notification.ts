import { EmailClient } from "../lib/email-client.js";
import { SmsClient } from "../lib/sms-client.js";

const email = new EmailClient(process.env.SENDGRID_KEY ?? "");
const sms = new SmsClient(
  process.env.TWILIO_SID ?? "",
  process.env.TWILIO_TOKEN ?? "",
);

export class NotificationService {
  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    await email.send(to, subject, body);
  }

  async sendSms(to: string, message: string): Promise<void> {
    await sms.send(to, message);
  }

  async notifyUser(emailAddr: string, phone: string, message: string): Promise<void> {
    await Promise.all([
      this.sendEmail(emailAddr, "Notification", message),
      this.sendSms(phone, message),
    ]);
  }
}
