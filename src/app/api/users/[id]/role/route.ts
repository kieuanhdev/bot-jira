import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/guards";
import { ROLES, type Role } from "@/lib/permissions";
import { readJsonBody } from "@/lib/api/json-body";
import { audit } from "@/lib/audit";

class LastAdminError extends Error {
  constructor() {
    super("last_admin");
  }
}

function isRolePayload(v: unknown): v is { role?: unknown } {
  return typeof v === "object" && v !== null;
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  const bodyResult = await readJsonBody(req, isRolePayload);
  if (!bodyResult.ok) return bodyResult.response;

  const { role } = bodyResult.data;
  if (typeof role !== "string" || !ROLES.includes(role as (typeof ROLES)[number])) {
    return NextResponse.json({ error: "invalid role" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, email: true },
  });
  if (!targetUser) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }

  try {
    const updatedUser = await prisma.$transaction(async (tx) => {
      if (targetUser.role === "admin" && role !== "admin") {
        const adminCount = await tx.user.count({ where: { role: "admin" } });
        if (adminCount <= 1) {
          throw new LastAdminError();
        }
      }

      return tx.user.update({
        where: { id },
        data: { role: role as Role },
        select: { id: true, role: true },
      });
    });

    await audit({
      actorId: auth.session.user.id,
      actorEmail: auth.session.user.email,
      action: "user.role_change",
      target: id,
      before: { role: targetUser.role },
      after: { role: updatedUser.role },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (e) {
    if (e instanceof LastAdminError) {
      return NextResponse.json({ error: "last_admin" }, { status: 409 });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "user not found" }, { status: 404 });
    }
    throw e;
  }
}

