import { PaymentService } from "../services/payment.js";
import { SubscriptionService } from "../services/subscription.js";
import { UserModel } from "../models/user.js";
import type { User } from "../models/user.js";

const payments = new PaymentService();
const subscriptions = new SubscriptionService();

export async function handleBilling(
  action: string,
  userId: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const user: User | null = await UserModel.findById(userId);
  if (!user) throw new Error("User not found");

  switch (action) {
    case "charge":
      return payments.charge(
        userId,
        payload.amount as number,
        payload.currency as string,
        payload.token as string,
      );
    case "subscribe":
      return subscriptions.subscribe(userId, payload.planId as string, payload.token as string);
    case "cancel":
      return subscriptions.cancel(userId);
    case "invoices":
      return payments.getInvoices(userId);
    default:
      throw new Error(`Unknown billing action: ${action}`);
  }
}
