import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { hasJiraConfig } from "@/lib/env";
import { readJsonBody } from "@/lib/api/json-body";
import { RegisterBodySchema } from "@/lib/api/schemas";
import { checkAuthRateLimit } from "@/lib/rate-limit";

/**
 * Self-service registration.
 *
 * Open by default (the team web is an internal tool) — any person with the link
 * can create an account, then configure their own Jira/Bitbucket tokens in
 * Settings. Set REGISTER_DISABLED=1 to lock it to admins.
 */
export async function POST(req: Request) {
  // Public registration is disabled in favor of Jira token login.
  if (process.env.LEGACY_PASSWORD_LOGIN !== "1") {
    return NextResponse.json(
      { error: "Đăng ký bằng email/mật khẩu đã ngừng hoạt động. Vui lòng đăng nhập trực tiếp bằng Jira API token." },
      { status: 410 }
    );
  }

  if (process.env.REGISTER_DISABLED === "1") {
    const session = await getSession();
    if (!session?.user?.role || session.user.role !== "admin") {
      return NextResponse.json({ error: "Registration is disabled" }, { status: 403 });
    }
  }

  const bodyResult = await readJsonBody(req, RegisterBodySchema);
  if (!bodyResult.ok) return bodyResult.response;

  const { displayName, email, password } = bodyResult.data;

  const name = (displayName ?? "").trim();
  const mail = (email ?? "").trim().toLowerCase();
  const pass = password ?? "";
  if (!name || !mail || !pass) {
    return NextResponse.json(
      { error: "displayName, email and password are required" },
      { status: 400 }
    );
  }

  const identifier = mail ? `register:${mail}` : "register:unknown";
  if (!checkAuthRateLimit(identifier)) {
    return NextResponse.json(
      { error: "Quá nhiều yêu cầu đăng ký. Vui lòng thử lại sau ít phút." },
      { status: 429 }
    );
  }

  if (pass.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: mail } });
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(pass, 10);
  const user = await prisma.user.create({
    data: { email: mail, displayName: name, passwordHash },
    select: { id: true, email: true, displayName: true, role: true },
  });

  return NextResponse.json({ user, jiraConfigured: hasJiraConfig() });
}
