import { UserModel } from "../models/user.js";
import type { User } from "../models/user.js";
import { PaymentService } from "./payment.js";

const payments = new PaymentService();

export class SubscriptionService {
  async subscribe(userId: string, planId: string, paymentToken: string): Promise<User | null> {
    const user = await UserModel.findById(userId);
    if (!user) return null;

    await payments.charge(userId, 9_99, "usd", paymentToken);

    // In reality this would update the user's planId
    return { ...user, planId };
  }

  async cancel(userId: string): Promise<void> {
    const user = await UserModel.findById(userId);
    if (!user) return;
    // Cancel logic
  }
}
