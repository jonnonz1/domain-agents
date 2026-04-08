import Stripe from "stripe";
import { UserModel } from "../models/user.model";
import { SubscriptionModel } from "../models/subscription.model";
import { InvoiceModel } from "../models/invoice.model";
import { EmailService } from "../services/email.service";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2023-10-16" as any });

export class BillingService {
  private emailService: EmailService;

  constructor() {
    this.emailService = new EmailService();
  }

  async createSubscription(userId: number, plan: "pro" | "enterprise"): Promise<void> {
    const user = await UserModel.findByPk(userId);
    if (!user) throw new Error("User not found");

    const stripeSubscription = await stripe.subscriptions.create({
      customer: `cus_${userId}`,
      items: [{ price: plan === "pro" ? "price_pro" : "price_enterprise" }],
    });

    await SubscriptionModel.create({
      userId,
      plan,
      stripeSubscriptionId: stripeSubscription.id,
      status: "active",
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
    } as any);

    await this.emailService.sendEmail(
      (user as any).email,
      "Subscription Confirmed",
      `<p>You are now on the <strong>${plan}</strong> plan.</p>`
    );
  }

  async getInvoices(userId: number): Promise<any[]> {
    return InvoiceModel.findAll({ where: { userId }, order: [["issuedAt", "DESC"]] });
  }
}
