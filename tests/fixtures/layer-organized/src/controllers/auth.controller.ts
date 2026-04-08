import { Request, Response } from "express";
import { AuthService } from "../services/auth.service";

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  async login(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body;
    const token = await this.authService.login(email, password);
    res.json({ token });
  }

  async register(req: Request, res: Response): Promise<void> {
    const { email, password, name } = req.body;
    await this.authService.register(email, password, name);
    res.status(201).json({ message: "User registered" });
  }
}
