import { describe, expect, it, vi, beforeEach } from "vitest";
import { getCurrentUserGate, USER_GATE_SELECT } from "./user-gate";
import { prisma } from "@/lib/prisma";

const { mockFindUnique } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
    },
  },
}));

describe("user-gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports USER_GATE_SELECT with the union of required fields", () => {
    expect(USER_GATE_SELECT).toEqual({
      id: true,
      jiraUserEnc: true,
      jiraTokenEnc: true,
      jiraAuth: true,
      jiraVerifiedAt: true,
      jiraUsername: true,
      onboarded: true,
      role: true,
      boardProjects: true,
    });
  });

  it("returns null without querying if userId is empty", async () => {
    const result = await getCurrentUserGate("");
    expect(result).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("queries prisma.user.findUnique with exact select and returns result", async () => {
    const mockUser = {
      id: "user-123",
      jiraUserEnc: "enc-user",
      jiraTokenEnc: "enc-token",
      jiraAuth: "basic",
      jiraVerifiedAt: new Date(),
      jiraUsername: "jdoe",
      onboarded: true,
      role: "member",
      boardProjects: ["PROJ"],
    };

    mockFindUnique.mockResolvedValueOnce(mockUser);

    const user = await getCurrentUserGate("user-123");
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-123" },
      select: USER_GATE_SELECT,
    });
    expect(user).toEqual(mockUser);
  });
});
