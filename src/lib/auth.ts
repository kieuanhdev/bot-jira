import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { checkAuthRateLimit } from "./rate-limit";
import { verifyJiraCredential, resolveAndPersistJiraUser } from "./jira/auth-service";

const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
    id: "jira-token",
    name: "Jira Token",
    credentials: {
      token: { label: "Jira Token", type: "password" },
      username: { label: "Username", type: "text" },
    },
    async authorize(credentials, req) {
      const token = credentials?.token?.trim() || "";
      const { cleanString } = await import("@/lib/jira/auth-service");
      const cleanUsername = cleanString(credentials?.username) || undefined;

      if (!token) {
        console.warn("[AUTH] Token empty");
        throw new Error("Vui lòng nhập Jira API token.");
      }

      // Rate limit check by client IP
      const rawIp =
        (req.headers?.["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        (req.headers?.["x-real-ip"] as string) ||
        "unknown";

      if (!checkAuthRateLimit(rawIp)) {
        console.warn(`[AUTH] Rate limited IP: ${rawIp}`);
        throw new Error("Quá nhiều yêu cầu đăng nhập. Vui lòng thử lại sau ít phút.");
      }

      const verification = await verifyJiraCredential({
        token,
        username: cleanUsername,
      });

      if (!verification.ok) {
        console.warn(`[AUTH] Jira verify failed: code=${verification.code} — ${verification.message}`);
        throw new Error(verification.message);
      }

      const resolved = await resolveAndPersistJiraUser(
        verification,
        cleanUsername
      );

      // Return minimal session profile. Never return Jira token!
      return {
        id: resolved.user.id,
        email: resolved.user.email,
        name: resolved.user.displayName,
        image: null,
        role: resolved.user.role,
        jiraUsername: resolved.user.jiraUsername ?? undefined,
      };
    },
  }),
];

// Break-glass fallback: legacy email/password provider only when feature flag is set
if (process.env.LEGACY_PASSWORD_LOGIN === "1") {
  providers.push(
    CredentialsProvider({
      id: "credentials",
      name: "Legacy Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });
        if (!user || !user.passwordHash) return null;
        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.displayName,
          image: null,
          role: user.role,
          jiraUsername: user.jiraUsername ?? undefined,
        };
      },
    })
  );
}

export const authOptions: NextAuthOptions = {
  // 30 days session
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
  providers,
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-next-auth.session-token"
          : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? undefined;
        token.role = user.role;
        const rawJiraUser = user.jiraUsername;
        token.jiraUsername =
          rawJiraUser && rawJiraUser !== "undefined" ? rawJiraUser : undefined;
        if (user.name) token.name = user.name;
        if (user.email) token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? "";
        session.user.role = (token.role as string) ?? "member";
        let jUser: string | null = (token.jiraUsername as string | undefined) ?? null;
        if (!jUser || jUser === "undefined") {
          const dbUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { jiraUsername: true, displayName: true },
          });
          jUser = dbUser?.jiraUsername ?? null;
          if (dbUser?.displayName && !token.name) {
            session.user.name = dbUser.displayName;
          }
        }
        session.user.jiraUsername = jUser;
        if (token.name) session.user.name = token.name as string;
        if (token.email) session.user.email = token.email as string;
      }
      return session;
    },
  },
};

export type { NextAuthOptions };
