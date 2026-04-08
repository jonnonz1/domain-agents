import { InvoiceModel } from "../models/invoice.js";
import type { Invoice } from "../models/invoice.js";
import { StripeClient } from "../lib/stripe-client.js";

const stripe = new StripeClient(process.env.STRIPE_KEY ?? "");

export class PaymentService {
  async charge(userId: string, amount: number, currency: string, token: string): Promise<Invoice> {
    const chargeId = await stripe.createCharge(amount, currency, token);
    const invoice = await InvoiceModel.create({
      userId,
      amount,
      currency,
      status: "paid",
    });
    return invoice;
  }

  async getInvoices(userId: string): Promise<Invoice[]> {
    return InvoiceModel.findByUserId(userId);
  }
}
