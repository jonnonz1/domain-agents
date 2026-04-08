import { Request, Response } from "express";
import { UserService } from "../services/user.service";

export class UserController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  async getUser(req: Request, res: Response): Promise<void> {
    const user = await this.userService.getUser(Number(req.params.id));
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ user });
  }

  async updateProfile(req: Request, res: Response): Promise<void> {
    const user = await this.userService.updateProfile(Number(req.params.id), req.body);
    res.json({ user });
  }
}
