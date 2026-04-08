export interface AuthToken {
  sub: string;
  iat: number;
  exp: number;
  roles: string[];
}

export interface Credentials {
  email: string;
  password: string;
}
