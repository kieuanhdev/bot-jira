import { PgBoss } from "pg-boss";
import { env } from "@/lib/env";

export type BossStopOptions = {
  graceful: boolean;
  timeout: number;
};

export interface BossLifecycleClient<TClient> {
  start(): Promise<TClient>;
  stop(options: BossStopOptions): Promise<void>;
}

export type BossLifecycleState<TClient> = {
  boss?: TClient;
  bossStart?: Promise<TClient>;
};

export function createBossLifecycle<TClient extends BossLifecycleClient<TClient>>(
  createBoss: () => TClient,
  state: BossLifecycleState<TClient> = {}
) {
  function getBoss(): TClient {
    if (!state.boss) state.boss = createBoss();
    return state.boss;
  }

  function startBoss(): Promise<TClient> {
    if (!state.bossStart) {
      const boss = getBoss();
      state.bossStart = boss.start().catch((error) => {
        state.bossStart = undefined;
        throw error;
      });
    }
    return state.bossStart;
  }

  async function stopBoss(): Promise<void> {
    if (!state.boss) return;
    await state.boss.stop({ graceful: true, timeout: 30_000 });
    state.boss = undefined;
    state.bossStart = undefined;
  }

  return { getBoss, startBoss, stopBoss };
}

declare global {
  var boss: PgBoss | undefined;
  var bossStart: Promise<PgBoss> | undefined;
}

const globalForBoss: BossLifecycleState<PgBoss> = {
  get boss() {
    return globalThis.boss;
  },
  set boss(value) {
    globalThis.boss = value;
  },
  get bossStart() {
    return globalThis.bossStart;
  },
  set bossStart(value) {
    globalThis.bossStart = value;
  },
};

const lifecycle = createBossLifecycle(
  () =>
    new PgBoss({
      connectionString: env.databaseUrl,
      useListenNotify: true,
    }),
  globalForBoss
);

export const getBoss = lifecycle.getBoss;
export const startBoss = lifecycle.startBoss;
export const stopBoss = lifecycle.stopBoss;
