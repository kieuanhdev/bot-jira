import { prisma } from "@/lib/prisma";
import type { IntegrationCursor } from "@prisma/client";

export class SyncAlreadyRunningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncAlreadyRunningError";
  }
}

export class SyncLeaseLostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncLeaseLostError";
  }
}

export class JiraSyncAbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JiraSyncAbortedError";
  }
}

/**
 * Atomically claims the Jira sync lease for a project key.
 *
 * Succeeds only when:
 * 1. There is no active run (activeRunToken is null or activeRunExpiresAt is null), or
 * 2. The previous active run lease has expired (activeRunExpiresAt <= now), or
 * 3. The current row was just created with the same runToken.
 *
 * Throws SyncAlreadyRunningError if another active unexpired run holds the lease.
 */
export async function claimJiraSyncLease(
  projectKey: string,
  runToken: string,
  expiresAt: Date,
  now: Date = new Date()
): Promise<IntegrationCursor> {
  await prisma.integrationCursor.upsert({
    where: { integration_scope: { integration: "jira", scope: projectKey } },
    create: {
      integration: "jira",
      scope: projectKey,
      activeRunToken: runToken,
      activeRunStartedAt: now,
      activeRunExpiresAt: expiresAt,
      lastStartedAt: now,
    },
    update: {},
  });

  const res = await prisma.integrationCursor.updateMany({
    where: {
      integration: "jira",
      scope: projectKey,
      OR: [
        { activeRunToken: null },
        { activeRunExpiresAt: null },
        { activeRunExpiresAt: { lte: now } },
        { activeRunToken: runToken },
      ],
    },
    data: {
      activeRunToken: runToken,
      activeRunStartedAt: now,
      activeRunExpiresAt: expiresAt,
      lastStartedAt: now,
      lastError: null,
    },
  });

  if (res.count === 0) {
    throw new SyncAlreadyRunningError(
      `Jira sync for project ${projectKey} is already running under an active lease`
    );
  }

  const cursor = await prisma.integrationCursor.findUnique({
    where: { integration_scope: { integration: "jira", scope: projectKey } },
  });

  if (!cursor || cursor.activeRunToken !== runToken) {
    throw new SyncAlreadyRunningError(
      `Jira sync for project ${projectKey} is already running under an active lease`
    );
  }

  return cursor;
}

/**
 * Asserts that the current run token still holds the active lease for the project,
 * and that the execution signal has not been aborted.
 *
 * Throws JiraSyncAbortedError if signal is aborted.
 * Throws SyncLeaseLostError if the activeRunToken changed or was cleared.
 */
export async function assertJiraSyncLease(
  projectKey: string,
  runToken: string,
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) {
    throw new JiraSyncAbortedError(`Jira sync aborted for ${projectKey}`);
  }

  const cursor = await prisma.integrationCursor.findUnique({
    where: { integration_scope: { integration: "jira", scope: projectKey } },
    select: { activeRunToken: true },
  });

  if (!cursor || cursor.activeRunToken !== runToken) {
    throw new SyncLeaseLostError(
      `Jira sync lease lost for project ${projectKey}: expected token ${runToken}, found ${cursor?.activeRunToken ?? "none"}`
    );
  }
}

/**
 * Safely releases the Jira sync lease only if the lease still belongs to this runToken.
 * Does not overwrite or clear a lease taken over by another job.
 */
export async function releaseJiraSyncLease(
  projectKey: string,
  runToken: string
): Promise<boolean> {
  const res = await prisma.integrationCursor.updateMany({
    where: {
      integration: "jira",
      scope: projectKey,
      activeRunToken: runToken,
    },
    data: {
      activeRunToken: null,
      activeRunStartedAt: null,
      activeRunExpiresAt: null,
    },
  });

  return res.count > 0;
}
