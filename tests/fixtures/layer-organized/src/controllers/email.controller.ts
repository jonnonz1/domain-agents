import { Request, Response } from "express";
import { EmailService } from "../services/email.service";

export class EmailController {
  private emailService: EmailService;

  constructor() {
    this.emailService = new EmailService();
  }

  async send(req: Request, res: Response): Promise<void> {
    const { to, subject, body } = req.body;
    await this.emailService.sendEmail(to, subject, body);
    res.json({ message: "Email sent" });
  }

  async schedule(req: Request, res: Response): Promise<void> {
    const { to, subject, body, scheduledAt } = req.body;
    await this.emailService.scheduleEmail(to, subject, body, new Date(scheduledAt));
    res.json({ message: "Email scheduled" });
  }
}
