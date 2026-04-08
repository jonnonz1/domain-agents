import { BillingService } from "./billing.service.js";
import { UserRepository } from "../users/user.repository.js";
import type { Subscription, Plan } from "./types.js";

export class SubscriptionManager {
  private billingService: BillingService;
  private userRepo: UserRepository;

  constructor(billingService: BillingService, userRepo: UserRepository) {
    this.billingService = billingService;
    this.userRepo = userRepo;
  }

  async subscribe(userId: string, plan: Plan): Promise<Subscription> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    return this.billingService.createSubscription(userId, plan);
  }

  async cancel(subscriptionId: string): Promise<Subscription> {
    return this.billingService.cancelSubscription(subscriptionId);
  }
}
