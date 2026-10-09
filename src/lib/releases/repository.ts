import { prisma } from "@/lib/prisma";
import type { GateResult } from "./gates/types";
import { buildGatePersistencePayload } from "./summary-builder";

export const NON_OVERRIDABLE_GATES = new Set(["non_empty_release", "ci"]);

export type ReleaseCheckPersistenceInput = {
  status: string;
  summary: string;
  blockers: unknown[];
  sourceTimes: unknown;
  gates: GateResult[];
  triggeredBy?: string | null;
};

export type GateOverrideInput = {
  gate: string;
  reason: string;
  createdById: string;
  expiresAt?: Date | null;
};

export type ReleaseApprovalInput = {
  type: "qa" | "release_manager";
  approvedById: string;
  note?: string;
};

export type ReleaseCheckHistoryOptions = {
  limit?: number;
  offset?: number;
};

/**
 * Fetch a release by its ID.
 */
export async function findReleaseById(id: string) {
  return prisma.release.findUnique({
    where: { id },
  });
}

/**
 * Update the status of a release.
 */
export async function updateReleaseStatus(
  id: string,
  status: "ready" | "blocked" | "unknown" | "released" | "draft",
  releasedAt?: Date | null
) {
  return prisma.release.update({
    where: { id },
    data: {
      status,
      ...(releasedAt !== undefined ? { releasedAt } : {}),
    },
    select: { id: true, version: true, releasedAt: true, status: true },
  });
}

/**
 * Update release notes or description.
 */
export async function updateReleaseMetadata(
  id: string,
  data: { notes?: string; description?: string }
) {
  return prisma.release.update({
    where: { id },
    data: {
      notes: typeof data.notes === "string" ? data.notes : undefined,
      description: typeof data.description === "string" ? data.description : undefined,
    },
  });
}

/**
 * Persist release ready check results and per-gate rows to DB,
 * and update the release's top-level status.
 */
export async function persistReleaseCheckResult(
  releaseId: string,
  data: ReleaseCheckPersistenceInput
) {
  await prisma.release.update({
    where: { id: releaseId },
    data: { status: data.status as "ready" | "blocked" | "unknown" },
  });

  return prisma.releaseCheck.create({
    data: {
      releaseId,
      triggeredBy: data.triggeredBy ?? null,
      status: data.status,
      summary: data.summary,
      blockers: JSON.parse(JSON.stringify(data.blockers)) as object,
      sourceTimes: JSON.parse(JSON.stringify(data.sourceTimes)) as object,
      gates: {
        create: buildGatePersistencePayload(data.gates),
      },
    },
    include: { gates: true },
  });
}

/**
 * Query check history for a release with per-gate results and pagination.
 */
export async function getReleaseCheckHistory(
  releaseId: string,
  options: ReleaseCheckHistoryOptions = {}
) {
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;

  const [total, checks] = await Promise.all([
    prisma.releaseCheck.count({ where: { releaseId } }),
    prisma.releaseCheck.findMany({
      where: { releaseId },
      include: { gates: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
  ]);

  return {
    releaseId,
    total,
    limit,
    offset,
    checks: checks.map((c) => ({
      id: c.id,
      triggeredBy: c.triggeredBy,
      status: c.status,
      summary: c.summary,
      blockers: c.blockers,
      sourceTimes: c.sourceTimes,
      createdAt: c.createdAt,
      gates: c.gates.map((g) => ({
        id: g.id,
        gate: g.gate,
        state: g.state,
        summary: g.summary,
        details: g.details,
        sourceTime: g.sourceTime,
        createdAt: g.createdAt,
      })),
    })),
  };
}

/**
 * List gate overrides for a release.
 */
export async function listReleaseGateOverrides(releaseId: string) {
  return prisma.releaseGateOverride.findMany({
    where: { releaseId },
    select: {
      id: true,
      gate: true,
      reason: true,
      createdById: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
}

/**
 * Create a gate override row after validating it is not a non-overridable gate.
 */
export async function createReleaseGateOverride(
  releaseId: string,
  data: GateOverrideInput
) {
  const gate = data.gate.trim();
  const reason = data.reason.trim();

  if (!gate) {
    throw new Error("gate required");
  }
  if (!reason) {
    throw new Error("reason required");
  }
  if (NON_OVERRIDABLE_GATES.has(gate)) {
    throw new Error(`gate "${gate}" cannot be overridden`);
  }

  return prisma.releaseGateOverride.create({
    data: {
      releaseId,
      gate,
      reason,
      createdById: data.createdById,
      expiresAt: data.expiresAt ?? null,
    },
  });
}

/**
 * Revoke an existing gate override by id.
 */
export async function revokeReleaseGateOverride(
  overrideId: string,
  releaseId: string
) {
  const override = await prisma.releaseGateOverride.findUnique({
    where: { id: overrideId },
  });

  if (!override || override.releaseId !== releaseId) {
    return null;
  }

  return prisma.releaseGateOverride.update({
    where: { id: overrideId },
    data: { revokedAt: new Date() },
  });
}

/**
 * List manual approvals for a release.
 */
export async function listReleaseApprovals(releaseId: string) {
  return prisma.releaseApproval.findMany({
    where: { releaseId },
  });
}

/**
 * Create a manual approval for a release.
 */
export async function createReleaseApproval(
  releaseId: string,
  data: ReleaseApprovalInput
) {
  if (!["qa", "release_manager"].includes(data.type)) {
    throw new Error("invalid approval type");
  }

  return prisma.releaseApproval.create({
    data: {
      releaseId,
      type: data.type,
      approvedById: data.approvedById,
      note: data.note ?? "",
    },
  });
}

/**
 * Revoke a manual approval. Caller must be the approver or an admin.
 */
export async function revokeReleaseApproval(
  approvalId: string,
  releaseId: string,
  actor: { id: string; role: string }
) {
  const approval = await prisma.releaseApproval.findUnique({
    where: { id: approvalId },
  });

  if (!approval || approval.releaseId !== releaseId) {
    return { error: "not_found" as const };
  }

  if (approval.approvedById !== actor.id && actor.role !== "admin") {
    return { error: "forbidden" as const };
  }

  const updated = await prisma.releaseApproval.update({
    where: { id: approvalId },
    data: { revokedAt: new Date() },
  });

  return { ok: true as const, approval: updated };
}

/**
 * Attach Jira issue keys to a release in ReleaseTask table.
 */
export async function attachReleaseIssues(releaseId: string, jiraKeys: string[]) {
  if (jiraKeys.length === 0) return { count: 0 };
  return prisma.releaseTask.createMany({
    data: jiraKeys.map((jiraKey) => ({ releaseId, jiraKey })),
    skipDuplicates: true,
  });
}

/**
 * Synchronize Jira issue keys for a release: adds new ones, removes unattached ones.
 */
export async function syncReleaseTasksFromIssues(releaseId: string, jiraKeys: string[]) {
  if (jiraKeys.length > 0) {
    await prisma.releaseTask.createMany({
      data: jiraKeys.map((jiraKey) => ({ releaseId, jiraKey })),
      skipDuplicates: true,
    });
    await prisma.releaseTask.deleteMany({
      where: {
        releaseId,
        jiraKey: { notIn: jiraKeys },
      },
    });
  } else {
    await prisma.releaseTask.deleteMany({
      where: { releaseId },
    });
  }
}
