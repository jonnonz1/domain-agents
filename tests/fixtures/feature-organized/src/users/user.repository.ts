import type { User } from "./types.js";

export class UserRepository {
  private users: Map<string, User> = new Map();

  async findById(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async findByEmail(email: string): Promise<User | undefined> {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return undefined;
  }

  async create(data: { email: string; name: string }): Promise<User> {
    const user: User = {
      id: `usr_${Date.now()}`,
      email: data.email,
      name: data.name,
      createdAt: new Date(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async update(id: string, data: Partial<Pick<User, "email" | "name">>): Promise<User> {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User ${id} not found`);
    }
    const updated = { ...user, ...data };
    this.users.set(id, updated);
    return updated;
  }
}
