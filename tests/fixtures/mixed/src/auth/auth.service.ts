import { AuthRepository } from "./auth.repository.js";
import type { AuthToken, Credentials } from "./auth.types.js";

export class AuthService {
  private repo: AuthRepository;

  constructor() {
    this.repo = new AuthRepository();
  }

  async login(credentials: Credentials): Promise<AuthToken | null> {
    const stored = await this.repo.findByEmail(credentials.email);
    if (!stored) return null;

    return {
      sub: credentials.email,
      iat: Date.now(),
      exp: Date.now() + 3600_000,
      roles: ["user"],
    };
  }

  async register(credentials: Credentials): Promise<void> {
    await this.repo.saveCredentials(credentials);
  }
}
