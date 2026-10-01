import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  userBoardPreferenceFindUnique: vi.fn(),
  userBoardPreferenceDeleteMany: vi.fn(),
  getBoardsForProject: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    userBoardPreference: {
      findUnique: mocks.userBoardPreferenceFindUnique,
      deleteMany: mocks.userBoardPreferenceDeleteMany,
    },
  },
}));
vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: vi.fn().mockImplementation((user) =>
    user?.jiraTokenEnc ? { user: "test_user", token: "tok", authMode: "Bearer" } : null
  ),
}));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({
    getBoardsForProject: mocks.getBoardsForProject,
  }),
  JiraRequestError: class extends Error {
    status: number;
    retryable: boolean;
    constructor(msg: string, status = 500, retryable = false) {
      super(msg);
      this.status = status;
      this.retryable = retryable;
    }
  },
}));
vi.mock("@/lib/env", () => ({
  projectBoardIds: { DEFAULT_PROJ: 99 },
}));

import { GET } from "./route";
import { clearBoardOptionsCache } from "@/lib/jira/board-options";

describe("GET /api/board/options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearBoardOptionsCache();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.user.mockResolvedValue({
      id: "user-1",
      jiraTokenEnc: "enc",
      jiraUserEnc: "enc",
      jiraUsername: "test_user",
    });
    mocks.userBoardPreferenceFindUnique.mockResolvedValue(null);
  });

  it("returns 401 when unauthorized", async () => {
    mocks.session.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/board/options?project=EPM"));
    expect(res.status).toBe(401);
  });

  it("returns 428 when user has no Jira credentials", async () => {
    mocks.user.mockResolvedValue({ id: "user-1", jiraTokenEnc: null });
    const res = await GET(new Request("http://localhost/api/board/options?project=EPM"));
    expect(res.status).toBe(428);
  });

  it("returns 400 when project query param is missing", async () => {
    const res = await GET(new Request("http://localhost/api/board/options"));
    expect(res.status).toBe(400);
  });

  it("auto-selects when project has a single board", async () => {
    mocks.getBoardsForProject.mockResolvedValue([
      { id: 101, name: "EPM Scrum", type: "scrum" },
    ]);

    const res = await GET(new Request("http://localhost/api/board/options?project=EPM"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projectKey).toBe("EPM");
    expect(body.selectedBoardId).toBe(101);
    expect(body.selectionSource).toBe("single_board");
    expect(body.requiresSelection).toBe(false);
    expect(body.items).toHaveLength(1);
  });

  it("defaults to kanban board when project has multiple boards and no preference", async () => {
    mocks.getBoardsForProject.mockResolvedValue([
      { id: 101, name: "EPM Scrum", type: "scrum" },
      { id: 102, name: "EPM Kanban", type: "kanban" },
    ]);

    const res = await GET(new Request("http://localhost/api/board/options?project=EPM"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.selectedBoardId).toBe(102);
    expect(body.selectionSource).toBe("environment_default");
    expect(body.requiresSelection).toBe(false);
    expect(body.items).toHaveLength(2);
  });

  it("marks requiresSelection: true when project has multiple non-kanban boards and no preference", async () => {
    mocks.getBoardsForProject.mockResolvedValue([
      { id: 101, name: "EPM Scrum 1", type: "scrum" },
      { id: 103, name: "EPM Scrum 2", type: "scrum" },
    ]);

    const res = await GET(new Request("http://localhost/api/board/options?project=EPM"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.selectedBoardId).toBeNull();
    expect(body.selectionSource).toBe("none");
    expect(body.requiresSelection).toBe(true);
    expect(body.items).toHaveLength(2);
  });

  it("prioritizes user preference from DB", async () => {
    mocks.getBoardsForProject.mockResolvedValue([
      { id: 101, name: "EPM Scrum", type: "scrum" },
      { id: 102, name: "EPM Kanban", type: "kanban" },
    ]);
    mocks.userBoardPreferenceFindUnique.mockResolvedValue({
      boardId: 102,
      projectKey: "EPM",
    });

    const res = await GET(new Request("http://localhost/api/board/options?project=EPM"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.selectedBoardId).toBe(102);
    expect(body.selectionSource).toBe("user_preference");
    expect(body.requiresSelection).toBe(false);
  });

  it("uses environment_default when projectBoardIds matches an available board", async () => {
    mocks.getBoardsForProject.mockResolvedValue([
      { id: 99, name: "Default Board", type: "scrum" },
      { id: 100, name: "Other Board", type: "kanban" },
    ]);

    const res = await GET(new Request("http://localhost/api/board/options?project=DEFAULT_PROJ"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.selectedBoardId).toBe(99);
    expect(body.selectionSource).toBe("environment_default");
    expect(body.requiresSelection).toBe(false);
  });
});
