import { BillingService } from "./billing.service.js";
import type { Invoice } from "./types.js";

export class InvoiceGenerator {
  private billingService: BillingService;

  constructor(billingService: BillingService) {
    this.billingService = billingService;
  }

  async generateMonthlyInvoices(userId: string): Promise<Invoice[]> {
    return this.billingService.getInvoices(userId);
  }
}
