import { UserModel } from "../models/user.js";
import { PaymentService } from "../services/payment.js";
import { SubscriptionService } from "../services/subscription.js";
import { NotificationService } from "../services/notification.js";

const payments = new PaymentService();
const subscriptions = new SubscriptionService();
const notifications = new NotificationService();

export async function handleAdmin(
  action: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  switch (action) {
    case "lookup-user": {
      return UserModel.findByEmail(payload.email as string);
    }
    case "refund": {
      const userId = payload.userId as string;
      const invoices = await payments.getInvoices(userId);
      // Stub: process refund for most recent invoice
      return { refunded: invoices.length > 0 };
    }
    case "cancel-subscription": {
      const userId = payload.userId as string;
      await subscriptions.cancel(userId);
      const user = await UserModel.findById(userId);
      if (user) {
        await notifications.sendEmail(
          user.email,
          "Subscription cancelled",
          "An admin has cancelled your subscription.",
        );
      }
      return { cancelled: true };
    }
    case "notify-all": {
      // Broadcast a message — in reality would iterate users
      await notifications.sendEmail(
        payload.email as string,
        payload.subject as string,
        payload.body as string,
      );
      return { sent: true };
    }
    default:
      throw new Error(`Unknown admin action: ${action}`);
  }
}
