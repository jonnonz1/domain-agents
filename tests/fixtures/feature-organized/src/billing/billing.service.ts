import { UserRepository } from "../users/user.repository.js";
import { EmailService } from "../email/email.service.js";
import type { Subscription, Invoice, Plan } from "./types.js";

export class BillingService {
  private userRepo: UserRepository;
  private emailService: EmailService;

  constructor(userRepo: UserRepository, emailService: EmailService) {
    this.userRepo = userRepo;
    this.emailService = emailService;
  }

  async createSubscription(userId: string, plan: Plan): Promise<Subscription> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    const subscription: Subscription = {
      id: `sub_${Date.now()}`,
      userId,
      plan,
      status: "active",
      startedAt: new Date(),
    };
    await this.emailService.sendEmail(user.email, "subscription-created", {
      plan: plan.name,
    });
    return subscription;
  }

  async cancelSubscription(subscriptionId: string): Promise<Subscription> {
    return {
      id: subscriptionId,
      userId: "unknown",
      plan: { id: "free", name: "Free", priceMonthly: 0, features: [] },
      status: "canceled",
      startedAt: new Date(),
      canceledAt: new Date(),
    };
  }

  async getInvoices(userId: string): Promise<Invoice[]> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    return [];
  }
}
