import "next-auth";
import "next-auth/jwt";
import type { Role } from "@/lib/permissions";

declare module "next-auth" {
  interface User {
    role: Role;
    jiraUsername?: string;
  }
  interface Session {
    user: {
      id: string;
      role: Role;
      jiraUsername: string | null;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    jiraUsername?: string;
  }
}
