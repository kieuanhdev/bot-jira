import { describe, it, expect } from "vitest";
import {
  computeReleaseSummary,
  buildGateCheckSummary,
  formatBlockerReasons,
  buildGateSourceTimes,
  buildGatePersistencePayload,
  buildReleaseCheckNotification,
} from "./summary-builder";
import type { Blocker, GateResult, ReleaseContext } from "./gates/types";

describe("summary-builder", () => {
  describe("computeReleaseSummary", () => {
    it("computes mutually exclusive KPI groups and archived count", () => {
      const items = [
        { id: "1", archived: true, jiraReleased: false, taskCount: 5, deliveryReadyCount: 5 },
        { id: "2", archived: false, jiraReleased: true, taskCount: 3, deliveryReadyCount: 3 },
        { id: "3", archived: false, jiraReleased: false, taskCount: 0, deliveryReadyCount: 0 },
        { id: "4", archived: false, jiraReleased: false, taskCount: 4, deliveryReadyCount: 4 },
        { id: "5", archived: false, jiraReleased: false, taskCount: 4, deliveryReadyCount: 2 },
      ];

      const summary = computeReleaseSummary(items);

      expect(summary.archived).toBe(1);
      expect(summary.released).toBe(1);
      expect(summary.empty).toBe(1);
      expect(summary.ready).toBe(1);
      expect(summary.inProgress).toBe(1);
      expect(summary.totalActive).toBe(4);
      expect(summary.totalActive).toBe(
        summary.inProgress + summary.ready + summary.empty + summary.released
      );
    });

    it("returns all zeros for empty items", () => {
      const summary = computeReleaseSummary([]);
      expect(summary).toEqual({
        totalActive: 0,
        inProgress: 0,
        ready: 0,
        empty: 0,
        released: 0,
        archived: 0,
      });
    });
  });

  describe("buildGateCheckSummary", () => {
    it("formats gate results into a comma-separated key-value string", () => {
      const gates: GateResult[] = [
        { gate: "non_empty_release", state: "passed", summary: "3 tasks", blockers: [] },
        { gate: "task_status", state: "failed", summary: "1 task not done", blockers: [] },
        { gate: "sentry", state: "unknown", summary: "unreachable", blockers: [] },
      ];

      expect(buildGateCheckSummary(gates)).toBe(
        "non_empty_release=passed, task_status=failed, sentry=unknown"
      );
    });

    it("returns empty string for empty gates array", () => {
      expect(buildGateCheckSummary([])).toBe("");
    });
  });

  describe("formatBlockerReasons", () => {
    it("formats reasons with jiraKey prefix when present", () => {
      const blockers: Blocker[] = [
        { source: "jira", jiraKey: "PROJ-1", reason: "Status is In Progress" },
        { source: "bitbucket", reason: "Branch has no PR" },
      ];

      expect(formatBlockerReasons(blockers)).toEqual([
        "PROJ-1: Status is In Progress",
        "Branch has no PR",
      ]);
    });

    it("truncates at limit (default 10)", () => {
      const blockers: Blocker[] = Array.from({ length: 15 }, (_, i) => ({
        source: "jira",
        jiraKey: `PROJ-${i + 1}`,
        reason: `Reason ${i + 1}`,
      }));

      const formatted = formatBlockerReasons(blockers);
      expect(formatted).toHaveLength(10);
      expect(formatted[0]).toBe("PROJ-1: Reason 1");
      expect(formatted[9]).toBe("PROJ-10: Reason 10");

      const customLimit = formatBlockerReasons(blockers, 3);
      expect(customLimit).toHaveLength(3);
    });
  });

  describe("buildGateSourceTimes", () => {
    it("creates snapshot of all source synchronization timestamps", () => {
      const checkedAt = new Date("2026-10-09T10:00:00Z");
      const syncedAt1 = new Date("2026-10-09T09:55:00Z");
      const syncedAt2 = new Date("2026-10-09T09:58:00Z");
      const sentryAt = new Date("2026-10-09T09:59:00Z");

      const ctx = {
        checkedAt,
        tasks: [
          { jiraKey: "EPM-1", lastSyncedAt: syncedAt1 },
          { jiraKey: "EPM-2", lastSyncedAt: syncedAt2 },
        ],
        sentryCheckedAt: sentryAt,
      } as unknown as ReleaseContext;

      const sourceTimes = buildGateSourceTimes(ctx);

      expect(sourceTimes).toEqual({
        checkedAt: "2026-10-09T10:00:00.000Z",
        taskLastSynced: [
          { key: "EPM-1", at: "2026-10-09T09:55:00.000Z" },
          { key: "EPM-2", at: "2026-10-09T09:58:00.000Z" },
        ],
        sentryCheckedAt: "2026-10-09T09:59:00.000Z",
      });
    });

    it("handles null sentryCheckedAt", () => {
      const ctx = {
        checkedAt: new Date("2026-10-09T10:00:00Z"),
        tasks: [],
        sentryCheckedAt: null,
      } as unknown as ReleaseContext;

      const sourceTimes = buildGateSourceTimes(ctx);
      expect(sourceTimes.sentryCheckedAt).toBeNull();
    });
  });

  describe("buildGatePersistencePayload", () => {
    it("maps gates to Prisma create records and preserves details JSON", () => {
      const sourceTime = new Date("2026-10-09T10:00:00Z");
      const gates: GateResult[] = [
        {
          gate: "pull_requests",
          state: "passed",
          summary: "All PRs merged",
          blockers: [],
          details: { mergedCount: 2 },
          sourceTime,
        },
        {
          gate: "sentry",
          state: "unknown",
          summary: "Unreachable",
          blockers: [],
        },
      ];

      const payload = buildGatePersistencePayload(gates);

      expect(payload).toEqual([
        {
          gate: "pull_requests",
          state: "passed",
          summary: "All PRs merged",
          details: { mergedCount: 2 },
          sourceTime,
        },
        {
          gate: "sentry",
          state: "unknown",
          summary: "Unreachable",
          details: undefined,
          sourceTime: null,
        },
      ]);
    });
  });

  describe("buildReleaseCheckNotification", () => {
    const release = { version: "v1.2.0" };

    it("creates ready notification with success severity", () => {
      const notif = buildReleaseCheckNotification(
        release,
        "ready",
        [],
        "All gates passed",
        "chk-1"
      );

      expect(notif).toEqual({
        type: "release",
        title: "Bản phát hành v1.2.0 đã sẵn sàng",
        body: "All gates passed",
        link: "/release",
        severity: "success",
        eventKey: "release-check:chk-1:ready",
      });
    });

    it("creates blocked notification with danger severity and reasons", () => {
      const blockers: Blocker[] = [
        { source: "jira", jiraKey: "EPM-1", reason: "Status is In Progress" },
      ];

      const notif = buildReleaseCheckNotification(
        release,
        "blocked",
        blockers,
        "task_status=failed",
        "chk-2"
      );

      expect(notif).toEqual({
        type: "release",
        title: "Bản phát hành v1.2.0 bị chặn",
        body: "EPM-1: Status is In Progress",
        link: "/release",
        severity: "danger",
        eventKey: "release-check:chk-2:blocked",
      });
    });

    it("creates unknown notification with warning severity", () => {
      const blockers: Blocker[] = [
        { source: "bitbucket", reason: "PR is still OPEN" },
      ];

      const notif = buildReleaseCheckNotification(
        release,
        "unknown",
        blockers,
        "pull_requests=unknown",
        "chk-3"
      );

      expect(notif).toEqual({
        type: "release",
        title: "Bản phát hành v1.2.0 chưa sẵn sàng",
        body: "PR is still OPEN",
        link: "/release",
        severity: "warning",
        eventKey: "release-check:chk-3:unknown",
      });
    });

    it("falls back to summary if blockers list is empty on blocked/unknown", () => {
      const notif = buildReleaseCheckNotification(
        release,
        "blocked",
        [],
        "non_empty_release=failed"
      );

      expect(notif.body).toBe("non_empty_release=failed");
      expect(notif.eventKey).toBe("release-check:latest:blocked");
    });
  });
});
