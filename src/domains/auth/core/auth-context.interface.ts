import { Request } from 'express';

export interface AuthenticatedUser {
  id: bigint;
  cognitoSub: string;
  email: string;
  nickname: string;
  profileImage: string | null;
  createdAt: Date;
}

export interface AuthContext {
  accessToken: string;
  user: AuthenticatedUser;
}

export type AuthenticatedRequest = Request & {
  authContext?: AuthContext;
};
