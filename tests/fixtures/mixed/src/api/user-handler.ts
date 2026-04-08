import { UserModel } from "../models/user.js";
import type { User } from "../models/user.js";
import { NotificationService } from "../services/notification.js";

const notifications = new NotificationService();

export async function handleUser(
  action: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  switch (action) {
    case "get": {
      const user = await UserModel.findById(payload.id as string);
      if (!user) throw new Error("User not found");
      return user;
    }
    case "create": {
      const user: User = await UserModel.create({
        email: payload.email as string,
        name: payload.name as string,
        planId: null,
      });
      await notifications.sendEmail(
        user.email,
        "Welcome!",
        `Hi ${user.name}, welcome aboard.`,
      );
      return user;
    }
    default:
      throw new Error(`Unknown user action: ${action}`);
  }
}
