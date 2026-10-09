import { describe, expect, it, vi } from "vitest";
import {
  createBossLifecycle,
  type BossLifecycleClient,
  type BossStopOptions,
} from "./connection";

type FakeBoss = BossLifecycleClient<FakeBoss> & {
  id: number;
};

function fakeBoss(id = 1) {
  const start = vi.fn<() => Promise<FakeBoss>>();
  const stop = vi.fn<(options: BossStopOptions) => Promise<void>>().mockResolvedValue(undefined);
  const boss: FakeBoss = { id, start, stop };
  start.mockResolvedValue(boss);
  return { boss, start, stop };
}

describe("pg-boss connection lifecycle", () => {
  it("creates one singleton and starts it once for concurrent callers", async () => {
    const instance = fakeBoss();
    const createBoss = vi.fn(() => instance.boss);
    const lifecycle = createBossLifecycle(createBoss);

    const [first, second, third] = await Promise.all([
      lifecycle.startBoss(),
      lifecycle.startBoss(),
      lifecycle.startBoss(),
    ]);

    expect(first).toBe(instance.boss);
    expect(second).toBe(instance.boss);
    expect(third).toBe(instance.boss);
    expect(createBoss).toHaveBeenCalledTimes(1);
    expect(instance.start).toHaveBeenCalledTimes(1);
    expect(lifecycle.getBoss()).toBe(instance.boss);
  });

  it("clears a failed start so the same singleton can retry", async () => {
    const instance = fakeBoss();
    instance.start
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce(instance.boss);
    const lifecycle = createBossLifecycle(() => instance.boss);

    await expect(lifecycle.startBoss()).rejects.toThrow("database unavailable");
    await expect(lifecycle.startBoss()).resolves.toBe(instance.boss);

    expect(instance.start).toHaveBeenCalledTimes(2);
  });

  it("stops gracefully and creates a fresh singleton after shutdown", async () => {
    const first = fakeBoss(1);
    const second = fakeBoss(2);
    const createBoss = vi.fn()
      .mockReturnValueOnce(first.boss)
      .mockReturnValueOnce(second.boss);
    const lifecycle = createBossLifecycle(createBoss);

    await lifecycle.startBoss();
    await lifecycle.stopBoss();

    expect(first.stop).toHaveBeenCalledWith({
      graceful: true,
      timeout: 30_000,
    });
    expect(await lifecycle.startBoss()).toBe(second.boss);
    expect(second.start).toHaveBeenCalledTimes(1);
    expect(createBoss).toHaveBeenCalledTimes(2);
  });

  it("does nothing when stopped before a connection is created", async () => {
    const createBoss = vi.fn(() => fakeBoss().boss);
    const lifecycle = createBossLifecycle(createBoss);

    await expect(lifecycle.stopBoss()).resolves.toBeUndefined();
    expect(createBoss).not.toHaveBeenCalled();
  });
});
