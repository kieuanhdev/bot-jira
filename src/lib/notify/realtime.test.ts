import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
const clients: Array<EventEmitter & { connect: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }> = [];
vi.mock("pg", () => ({ Client: class extends EventEmitter {
  connect = vi.fn().mockResolvedValue(undefined);
  query = vi.fn().mockResolvedValue(undefined);
  end = vi.fn().mockResolvedValue(undefined);
  constructor() { super(); clients.push(this); }
} }));
import { subscribeNotifications } from "./realtime";

describe("cross-process notification listener", () => {
  afterEach(() => { clients.at(-1)?.emit("end"); clients.length = 0; });
  it("shares one connection and only signals the notification owner", async () => {
    const alice = { userId: "alice", changed: vi.fn(), disconnected: vi.fn() };
    const bob = { userId: "bob", changed: vi.fn(), disconnected: vi.fn() };
    const unsubscribe = await subscribeNotifications(alice);
    await subscribeNotifications(bob);
    expect(clients).toHaveLength(1);
    expect(clients[0].query).toHaveBeenCalledWith("LISTEN notification_changes");
    clients[0].emit("notification", { channel: "notification_changes", payload: "alice" });
    expect(alice.changed).toHaveBeenCalledTimes(1);
    expect(bob.changed).not.toHaveBeenCalled();
    unsubscribe();
    clients[0].emit("notification", { channel: "notification_changes", payload: "alice" });
    expect(alice.changed).toHaveBeenCalledTimes(1);
  });
  it("disconnects streams on database failure and establishes a fresh listener on reconnect", async () => {
    const subscriber = { userId: "alice", changed: vi.fn(), disconnected: vi.fn() };
    await subscribeNotifications(subscriber);
    clients[0].emit("error", new Error("connection lost"));
    expect(subscriber.disconnected).toHaveBeenCalledTimes(1);
    await subscribeNotifications(subscriber);
    expect(clients).toHaveLength(2);
    clients[1].emit("notification", { channel: "notification_changes", payload: "alice" });
    expect(subscriber.changed).toHaveBeenCalledTimes(1);
  });
});
