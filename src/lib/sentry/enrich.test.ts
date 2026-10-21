import { beforeEach, describe, expect, it, vi } from "vitest";
import { enrichSentryRows, extractEventContext } from "./enrich";
import type { SentryEvent } from "./client";

const { prismaMock, getLatestEvent, credsFor } = vi.hoisted(() => ({
  prismaMock: { sentryIssueImported: { findMany: vi.fn(), update: vi.fn() } },
  getLatestEvent: vi.fn(),
  credsFor: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("./client", () => ({
  getLatestEvent,
  sanitizeSentryErrorMessage: (m: string) => m,
}));
vi.mock("./creds-for-project", () => ({ sentryCredsForProject: credsFor }));

const event = (tags: { key: string; value: string }[], culprit?: string): SentryEvent =>
  ({ eventID: "e1", tags, culprit }) as SentryEvent;

describe("extractEventContext", () => {
  it("reads release, environment and culprit", () => {
    expect(
      extractEventContext(
        event(
          [
            { key: "release", value: " app@2.3.1 " },
            { key: "environment", value: "production" },
          ],
          "lib/main.dart in run"
        )
      )
    ).toEqual({ release: "app@2.3.1", environment: "production", culprit: "lib/main.dart in run" });
  });

  it("omits missing or blank values", () => {
    expect(extractEventContext(event([{ key: "release", value: "  " }]))).toEqual({});
    expect(extractEventContext({ eventID: "e" } as SentryEvent)).toEqual({});
  });
});

describe("enrichSentryRows", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const rows = [
    { id: "a", sentryProject: "mobile", sentryIssueId: "1" },
    { id: "b", sentryProject: "mobile", sentryIssueId: "2" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.sentryIssueImported.update.mockResolvedValue({});
  });

  it("writes release/environment and stamps enrichedAt, resolving creds once per project", async () => {
    prismaMock.sentryIssueImported.findMany.mockResolvedValue(rows);
    credsFor.mockResolvedValue({ org: "o", project: "mobile", token: "t" });
    getLatestEvent.mockResolvedValue(event([{ key: "release", value: "r1" }]));

    const result = await enrichSentryRows(now);

    expect(result).toEqual({ enriched: 2, skipped: 0 });
    expect(credsFor).toHaveBeenCalledTimes(1);
    expect(prismaMock.sentryIssueImported.update).toHaveBeenCalledWith({
      where: { id: "a" },
      data: { release: "r1", enrichedAt: now },
    });
  });

  it("stamps enrichedAt without data when nobody can read the project, so it is not retried every run", async () => {
    prismaMock.sentryIssueImported.findMany.mockResolvedValue(rows);
    credsFor.mockResolvedValue(null);

    const result = await enrichSentryRows(now);

    expect(result).toEqual({ enriched: 0, skipped: 2 });
    expect(getLatestEvent).not.toHaveBeenCalled();
    expect(prismaMock.sentryIssueImported.update).toHaveBeenCalledWith({
      where: { id: "a" },
      data: { enrichedAt: now },
    });
  });

  it("a failing event fetch is skipped and stamped, and the other rows still run", async () => {
    prismaMock.sentryIssueImported.findMany.mockResolvedValue(rows);
    credsFor.mockResolvedValue({ org: "o", project: "mobile", token: "t" });
    getLatestEvent
      .mockRejectedValueOnce(new Error("Sentry -> 404"))
      .mockResolvedValueOnce(event([{ key: "environment", value: "staging" }]));

    const result = await enrichSentryRows(now);

    expect(result).toEqual({ enriched: 1, skipped: 1 });
    expect(prismaMock.sentryIssueImported.update).toHaveBeenCalledTimes(2);
  });

  it("only selects review rows that were never enriched or are stale", async () => {
    prismaMock.sentryIssueImported.findMany.mockResolvedValue([]);
    await enrichSentryRows(now);
    const arg = prismaMock.sentryIssueImported.findMany.mock.calls[0][0];
    expect(arg.where.state).toEqual({ in: ["review", "pending"] });
    expect(arg.where.OR[0]).toEqual({ enrichedAt: null });
    expect(arg.take).toBe(15);
  });

  it("never throws when the query itself fails", async () => {
    prismaMock.sentryIssueImported.findMany.mockRejectedValue(new Error("db down"));
    await expect(enrichSentryRows(now)).resolves.toEqual({ enriched: 0, skipped: 0 });
  });
});
