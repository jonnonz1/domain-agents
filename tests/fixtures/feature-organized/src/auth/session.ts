import type { AuthToken } from "./types.js";

export class SessionManager {
  private sessions: Map<string, AuthToken> = new Map();

  create(token: AuthToken): void {
    this.sessions.set(token.token, token);
  }

  get(tokenString: string): AuthToken | undefined {
    return this.sessions.get(tokenString);
  }

  destroy(tokenString: string): void {
    this.sessions.delete(tokenString);
  }
}
