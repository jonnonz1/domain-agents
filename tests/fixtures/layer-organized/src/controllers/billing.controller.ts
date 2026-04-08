import { Request, Response } from "express";
import { BillingService } from "../services/billing.service";

export class BillingController {
  private billingService: BillingService;

  constructor() {
    this.billingService = new BillingService();
  }

  async createSubscription(req: Request, res: Response): Promise<void> {
    const userId = (req as any).userId;
    const { plan } = req.body;
    await this.billingService.createSubscription(userId, plan);
    res.status(201).json({ message: "Subscription created" });
  }

  async getInvoices(req: Request, res: Response): Promise<void> {
    const userId = (req as any).userId;
    const invoices = await this.billingService.getInvoices(userId);
    res.json({ invoices });
  }
}
