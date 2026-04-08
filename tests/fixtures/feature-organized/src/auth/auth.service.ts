import { UserRepository } from "../users/user.repository.js";
import type { AuthToken, LoginRequest, RegisterRequest } from "./types.js";

export class AuthService {
  private userRepo: UserRepository;

  constructor(userRepo: UserRepository) {
    this.userRepo = userRepo;
  }

  async login(email: string, password: string): Promise<AuthToken> {
    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      throw new Error("Invalid credentials");
    }
    return {
      userId: user.id,
      token: `tok_${Date.now()}`,
      expiresAt: new Date(Date.now() + 3600_000),
    };
  }

  async register(email: string, password: string): Promise<AuthToken> {
    const existing = await this.userRepo.findByEmail(email);
    if (existing) {
      throw new Error("Email already registered");
    }
    const user = await this.userRepo.create({ email, name: email });
    return {
      userId: user.id,
      token: `tok_${Date.now()}`,
      expiresAt: new Date(Date.now() + 3600_000),
    };
  }

  verifyToken(token: string): boolean {
    return token.startsWith("tok_");
  }
}
