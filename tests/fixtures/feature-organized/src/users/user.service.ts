import { UserRepository } from "./user.repository.js";
import { EmailService } from "../email/email.service.js";
import type { User, UserProfile } from "./types.js";

export class UserService {
  private userRepo: UserRepository;
  private emailService: EmailService;

  constructor(userRepo: UserRepository, emailService: EmailService) {
    this.userRepo = userRepo;
    this.emailService = emailService;
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.userRepo.findById(id);
  }

  async updateProfile(id: string, data: Partial<UserProfile>): Promise<User> {
    const updated = await this.userRepo.update(id, { name: data.displayName });
    await this.emailService.sendEmail(updated.email, "profile-updated", {
      name: updated.name,
    });
    return updated;
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.userRepo.findById(id);
    if (!user) {
      throw new Error(`User ${id} not found`);
    }
    await this.emailService.sendEmail(user.email, "account-deleted", {
      name: user.name,
    });
  }
}
