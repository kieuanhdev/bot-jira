import { getSession } from "@/lib/session";
import { subscribeNotifications } from "@/lib/notify/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) return new Response(null, { status: 401 });
  const encoder = new TextEncoder();
  let close = () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let unsubscribe: (() => void) | undefined;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      close = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        request.signal.removeEventListener("abort", close);
        try { controller.close(); } catch { /* The reader may already have cancelled. */ }
      };
      request.signal.addEventListener("abort", close, { once: true });
      if (request.signal.aborted) { close(); return; }
      try {
        unsubscribe = await subscribeNotifications({
          userId: session.user.id,
          changed: () => { if (!closed) controller.enqueue(encoder.encode("data: changed\n\n")); },
          disconnected: close,
        });
        if (closed) { unsubscribe(); return; }
        // Reconnect refreshes persisted state, including signals missed offline.
        controller.enqueue(encoder.encode("retry: 1000\ndata: ready\n\n"));
        heartbeat = setInterval(() => {
          if (!closed) controller.enqueue(encoder.encode(": heartbeat\n\n"));
        }, 15000);
      } catch {
        close();
      }
    },
    cancel() { close(); },
  });
  return new Response(stream, { headers: {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  } });
}
