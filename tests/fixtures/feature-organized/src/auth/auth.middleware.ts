import { AuthService } from "./auth.service.js";

export function authMiddleware(authService: AuthService) {
  return (req: { headers: Record<string, string> }, res: unknown, next: () => void) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    if (!authService.verifyToken(token)) {
      throw new Error("Invalid token");
    }

    next();
  };
}
