import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { hasJiraConfig } from "@/lib/env";

/**
 * Self-service registration.
 *
 * Open by default (the team web is an internal tool) — any person with the link
 * can create an account, then configure their own Jira/Bitbucket tokens in
 * Settings. Set REGISTER_DISABLED=1 to lock it to admins.
 */
export async function POST(req: Request) {
  if (process.env.REGISTER_DISABLED === "1") {
    const session = await getSession();
    if (!session?.user?.role || session.user.role !== "admin") {
      return NextResponse.json({ error: "Registration is disabled" }, { status: 403 });
    }
  }

  const { displayName, email, password } = (await req.json()) as {
    displayName?: string;
    email?: string;
    password?: string;
  };

  const name = (displayName ?? "").trim();
  const mail = (email ?? "").trim().toLowerCase();
  if (!name || !mail || !password) {
    return NextResponse.json(
      { error: "displayName, email and password are required" },
      { status: 400 }
    );
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: mail } });
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email: mail, displayName: name, passwordHash },
    select: { id: true, email: true, displayName: true, role: true },
  });

  return NextResponse.json({ user, jiraConfigured: hasJiraConfig() });
}
