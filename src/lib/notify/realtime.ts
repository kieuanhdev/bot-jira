import { Client } from "pg";
import { env } from "@/lib/env";

type Subscriber = { userId: string; changed: () => void; disconnected: () => void };
type Listener = { client: Client; ready: Promise<void>; subscribers: Set<Subscriber> };
const state = globalThis as unknown as { notificationListener?: Listener };

/** One database listener per web process, shared by authenticated SSE clients. */
export async function subscribeNotifications(subscriber: Subscriber): Promise<() => void> {
  let listener = state.notificationListener;
  if (!listener) {
    const client = new Client({ connectionString: env.databaseUrl, connectionTimeoutMillis: 5000, keepAlive: true });
    const subscribers = new Set<Subscriber>();
    const current: Listener = { client, subscribers, ready: Promise.resolve() };
    state.notificationListener = current;
    const disconnect = () => {
      if (state.notificationListener !== current) return;
      state.notificationListener = undefined;
      for (const entry of subscribers) entry.disconnected();
      subscribers.clear();
      void client.end().catch(() => undefined);
    };
    client.on("error", disconnect);
    client.on("end", disconnect);
    client.on("notification", (message) => {
      if (message.channel !== "notification_changes") return;
      for (const entry of subscribers) {
        if (entry.userId === message.payload) entry.changed();
      }
    });
    current.ready = client.connect().then(async () => { await client.query("LISTEN notification_changes"); });
    listener = current;
  }
  try {
    await listener.ready;
  } catch (error) {
    if (state.notificationListener === listener) state.notificationListener = undefined;
    void listener.client.end().catch(() => undefined);
    throw error;
  }
  if (state.notificationListener !== listener) throw new Error("Notification listener disconnected");
  const active = listener;
  active.subscribers.add(subscriber);
  return () => { active.subscribers.delete(subscriber); };
}
