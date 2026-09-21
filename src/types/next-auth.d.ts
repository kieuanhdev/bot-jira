import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role: string;
    jiraUsername?: string;
  }
  interface Session {
    user: {
      id: string;
      role: string;
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
    role?: string;
    jiraUsername?: string;
  }
}
