import type { UserRole, UserStatus } from "@prisma/client";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  phone: string | null;
  avatarInitials: string | null;
  agentId: string | null;
  lastLoginAt: Date | null;
};

declare global {
  namespace Express {
    interface Request {
      /** Populated by `authenticate` middleware when a valid access cookie is present. */
      user?: AuthUser;
    }
  }
}

export {};
