import { describe, expect, it, vi } from "vitest";
import {
  derivePreset,
  loadSyncPolicy,
  presetToFeatures,
  requiresBackfill,
  resolveSyncFeatures,
  validateSyncFeatures,
  ALL_SYNC_FEATURES,
  PRESET_DEFINITIONS,
} from "./sync-features";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    jiraProject: {
      findMany: vi.fn(),
    },
  },
}));

describe("resolveSyncFeatures", () => {
  it("defaults all features to true when given null, empty object, or non-object", () => {
    const fromNull = resolveSyncFeatures(null);
    const fromEmpty = resolveSyncFeatures({});
    const fromArray = resolveSyncFeatures([]);
    const fromNumber = resolveSyncFeatures(123);

    for (const f of ALL_SYNC_FEATURES) {
      expect(fromNull[f]).toBe(true);
      expect(fromEmpty[f]).toBe(true);
      expect(fromArray[f]).toBe(true);
      expect(fromNumber[f]).toBe(true);
    }
  });

  it("preserves explicitly set boolean features and ignores unknown keys", () => {
    const resolved = resolveSyncFeatures({
      comments: false,
      aiScore: false,
      unknownKey: false,
      anotherKey: "invalid",
    });

    expect(resolved.comments).toBe(false);
    expect(resolved.aiScore).toBe(false);
    expect(resolved.workflow).toBe(true);
    expect((resolved as Record<string, unknown>).unknownKey).toBeUndefined();
  });

  it("defaults non-boolean values for known keys to true", () => {
    const resolved = resolveSyncFeatures({
      comments: "false",
      workflow: 0,
      notifications: null,
    });

    expect(resolved.comments).toBe(true);
    expect(resolved.workflow).toBe(true);
    expect(resolved.notifications).toBe(true);
  });
});

describe("derivePreset & presetToFeatures", () => {
  it("detects full, issues_comments, issues_only presets correctly", () => {
    expect(derivePreset(PRESET_DEFINITIONS.full)).toBe("full");
    expect(derivePreset(PRESET_DEFINITIONS.issues_comments)).toBe("issues_comments");
    expect(derivePreset(PRESET_DEFINITIONS.issues_only)).toBe("issues_only");
  });

  it("returns custom for non-matching combinations", () => {
    const custom = {
      ...PRESET_DEFINITIONS.full,
      workflow: false,
    };
    expect(derivePreset(custom)).toBe("custom");
  });

  it("presetToFeatures returns copies of preset definitions", () => {
    const full = presetToFeatures("full");
    expect(full).toEqual(PRESET_DEFINITIONS.full);
    full.comments = false;
    expect(PRESET_DEFINITIONS.full.comments).toBe(true);
  });
});

describe("validateSyncFeatures", () => {
  it("validates valid feature objects", () => {
    const res = validateSyncFeatures({ comments: false, workflow: true });
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.features).toEqual({ comments: false, workflow: true });
    }
  });

  it("rejects unknown keys", () => {
    const res = validateSyncFeatures({ unknownField: true });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.error).toContain("Hạng mục không hợp lệ");
    }
  });

  it("rejects non-boolean values", () => {
    const res = validateSyncFeatures({ comments: "true" });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.error).toContain("phải là kiểu boolean");
    }
  });
});

describe("requiresBackfill", () => {
  it("returns true when comments transitions from false to true", () => {
    const before = { ...PRESET_DEFINITIONS.full, comments: false };
    const after = { ...PRESET_DEFINITIONS.full, comments: true };
    expect(requiresBackfill(before, after)).toBe(true);
  });

  it("returns true when peopleFields transitions from false to true", () => {
    const before = { ...PRESET_DEFINITIONS.full, peopleFields: false };
    const after = { ...PRESET_DEFINITIONS.full, peopleFields: true };
    expect(requiresBackfill(before, after)).toBe(true);
  });

  it("returns false for other feature toggles", () => {
    const before = { ...PRESET_DEFINITIONS.full, workflow: false, aiScore: false };
    const after = { ...PRESET_DEFINITIONS.full, workflow: true, aiScore: true };
    expect(requiresBackfill(before, after)).toBe(false);
  });
});

describe("loadSyncPolicy", () => {
  it("enforces master sync switch: if syncEnabled=false or active=false, all features return false", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.jiraProject.findMany).mockResolvedValueOnce([
      {
        key: "PRJ1",
        active: true,
        syncEnabled: true,
        syncFeatures: { comments: false },
      },
      {
        key: "PRJ2",
        active: true,
        syncEnabled: false,
        syncFeatures: {},
      },
      {
        key: "PRJ3",
        active: false,
        syncEnabled: true,
        syncFeatures: {},
      },
    ] as unknown as Awaited<ReturnType<typeof prisma.jiraProject.findMany>>);

    const policy = await loadSyncPolicy();

    // PRJ1 has master enabled, comments false, workflow true
    expect(policy.isEnabled("PRJ1", "comments")).toBe(false);
    expect(policy.isEnabled("PRJ1", "workflow")).toBe(true);

    // PRJ2 has syncEnabled = false -> all features are false
    expect(policy.isEnabled("PRJ2", "workflow")).toBe(false);
    expect(policy.isEnabled("PRJ2", "comments")).toBe(false);

    // PRJ3 has active = false -> all features are false
    expect(policy.isEnabled("PRJ3", "workflow")).toBe(false);

    // Unknown project falls back to true
    expect(policy.isEnabled("UNKNOWN", "comments")).toBe(true);

    // disabledKeys for comments includes PRJ1 (feature off) and PRJ2, PRJ3 (master off)
    const disabledForComments = policy.disabledKeys("comments");
    expect(disabledForComments).toContain("PRJ1");
    expect(disabledForComments).toContain("PRJ2");
    expect(disabledForComments).toContain("PRJ3");
  });

  it("handles DB error gracefully by allowing all features", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.jiraProject.findMany).mockRejectedValueOnce(new Error("DB connection failure"));

    const policy = await loadSyncPolicy();
    expect(policy.isEnabled("ANY", "comments")).toBe(true);
    expect(policy.disabledKeys("comments")).toEqual([]);
  });
});
