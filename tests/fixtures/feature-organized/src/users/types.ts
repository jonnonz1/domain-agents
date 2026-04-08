export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export interface UserProfile {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
}

export interface Team {
  id: string;
  name: string;
  memberIds: string[];
  ownerId: string;
}
