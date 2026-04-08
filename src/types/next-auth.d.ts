import "next-auth";

export type UserRoleType =
  | "admin"
  | "financial_officer"
  | "project_manager"
  | "employee"
  | "client";

declare module "next-auth" {
  interface User {
    id: string;
    role: UserRoleType;
  }

  interface Session {
    user: {
      id: string;
      role: UserRoleType;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRoleType;
  }
}
