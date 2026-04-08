import { UserModel, User } from "../models/user.model";

export class UserService {
  async getUser(id: number): Promise<User | null> {
    const user = await UserModel.findByPk(id);
    return user ? (user.toJSON() as User) : null;
  }

  async updateProfile(id: number, updates: Partial<Pick<User, "name" | "email">>): Promise<User> {
    const user = await UserModel.findByPk(id);
    if (!user) throw new Error("User not found");

    await user.update(updates);
    return user.toJSON() as User;
  }
}
