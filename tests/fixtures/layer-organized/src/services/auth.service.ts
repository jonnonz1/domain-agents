import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { UserModel } from "../models/user.model";
import { EmailService } from "../services/email.service";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export class AuthService {
  private emailService: EmailService;

  constructor() {
    this.emailService = new EmailService();
  }

  async login(email: string, password: string): Promise<string> {
    const user = await UserModel.findOne({ where: { email } });
    if (!user) throw new Error("Invalid credentials");

    const valid = await bcrypt.compare(password, (user as any).passwordHash);
    if (!valid) throw new Error("Invalid credentials");

    return jwt.sign({ userId: (user as any).id, email }, JWT_SECRET, { expiresIn: "24h" });
  }

  async register(email: string, password: string, name: string): Promise<void> {
    const passwordHash = await bcrypt.hash(password, 10);
    await UserModel.create({ email, passwordHash, name } as any);
    await this.emailService.sendEmail(email, "Welcome!", `<h1>Welcome, ${name}!</h1>`);
  }

  verifyToken(token: string): { userId: number; email: string } {
    return jwt.verify(token, JWT_SECRET) as { userId: number; email: string };
  }
}
