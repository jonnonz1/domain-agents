export interface User {
  id: string;
  email: string;
  name: string;
  planId: string | null;
  createdAt: Date;
}

export class UserModel {
  static async findById(id: string): Promise<User | null> {
    return null;
  }

  static async findByEmail(email: string): Promise<User | null> {
    return null;
  }

  static async create(data: Omit<User, "id" | "createdAt">): Promise<User> {
    return { ...data, id: "generated", createdAt: new Date() };
  }
}
