import type { Credentials } from "./auth.types.js";

export class AuthRepository {
  async findByEmail(email: string): Promise<Credentials | null> {
    // Simulate DB lookup
    return null;
  }

  async saveCredentials(credentials: Credentials): Promise<void> {
    // Persist to auth store
  }
}
