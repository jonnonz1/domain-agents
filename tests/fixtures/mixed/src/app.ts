import { handleBilling } from "./api/billing-handler.js";
import { handleUser } from "./api/user-handler.js";
import { handleAdmin } from "./api/admin-handler.js";
import { AuthService } from "./auth/auth.service.js";

const auth = new AuthService();

interface Request {
  route: string;
  action: string;
  userId?: string;
  payload: Record<string, unknown>;
}

async function dispatch(req: Request): Promise<unknown> {
  switch (req.route) {
    case "billing":
      return handleBilling(req.action, req.userId!, req.payload);
    case "user":
      return handleUser(req.action, req.payload);
    case "admin":
      return handleAdmin(req.action, req.payload);
    case "auth":
      if (req.action === "login") {
        return auth.login({
          email: req.payload.email as string,
          password: req.payload.password as string,
        });
      }
      if (req.action === "register") {
        return auth.register({
          email: req.payload.email as string,
          password: req.payload.password as string,
        });
      }
      throw new Error(`Unknown auth action: ${req.action}`);
    default:
      throw new Error(`Unknown route: ${req.route}`);
  }
}

export { dispatch };
