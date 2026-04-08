import { UserRepository } from "./user.repository.js";
import type { Team, User } from "./types.js";

export class TeamService {
  private userRepo: UserRepository;

  constructor(userRepo: UserRepository) {
    this.userRepo = userRepo;
  }

  async getMembers(team: Team): Promise<User[]> {
    const members: User[] = [];
    for (const memberId of team.memberIds) {
      const user = await this.userRepo.findById(memberId);
      if (user) {
        members.push(user);
      }
    }
    return members;
  }
}
