import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/notify/realtime", () => ({ subscribeNotifications: mocks.subscribe }));
import { GET } from "./route";

describe("notification stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.subscribe.mockResolvedValue(mocks.unsubscribe);
  });
  it("rejects unauthenticated subscriptions", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/notify/stream"))).status).toBe(401);
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });
  it("refreshes on connect, streams changes for the session user and cleans up on cancel", async () => {
    const response = await GET(new Request("http://localhost/api/notify/stream?userId=someone-else"));
    const reader = response.body!.getReader();
    const decode = new TextDecoder();
    expect(decode.decode((await reader.read()).value)).toContain("data: ready");
    const subscriber = mocks.subscribe.mock.calls[0][0];
    expect(subscriber.userId).toBe("user-1");
    subscriber.changed();
    expect(decode.decode((await reader.read()).value)).toContain("data: changed");
    await reader.cancel();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
