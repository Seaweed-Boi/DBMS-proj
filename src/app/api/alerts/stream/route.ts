import { getCurrentUser } from "@/lib/auth";
import { createSubscriber, KEYS } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Server-Sent Events bridge for the Redis Pub/Sub alert channel. */
export async function GET(req: Request) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });

  const sub = createSubscriber();
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => {
        try { controller.enqueue(encoder.encode(chunk)); } catch { /* closed */ }
      };
      sub.on("message", (_channel, message) => send(`data: ${message}\n\n`));
      try {
        await sub.subscribe(KEYS.alertChannel);
        send(": connected\n\n");
      } catch {
        send("event: unavailable\ndata: redis\n\n");
      }
      heartbeat = setInterval(() => send(": ping\n\n"), 25_000);
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        sub.quit().catch(() => sub.disconnect());
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    cancel() {
      clearInterval(heartbeat);
      sub.quit().catch(() => sub.disconnect());
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
