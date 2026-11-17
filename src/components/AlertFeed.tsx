"use client";

import { useEffect, useState } from "react";
import type { Alert } from "@/lib/services/alerts";

const STYLE: Record<string, string> = {
  CRITICAL_SOS: "border-red-300 bg-red-50 text-red-800",
  LOW_STOCK: "border-amber-300 bg-amber-50 text-amber-900",
  NEAR_EXPIRY: "border-amber-300 bg-amber-50 text-amber-900",
};

/**
 * Live alert banner: subscribes to /api/alerts/stream (SSE bridge over
 * Redis Pub/Sub) and shows new alerts as dismissible toasts.
 */
export default function AlertFeed() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");

  useEffect(() => {
    // An open EventSource permanently occupies one of the browser's ~6
    // HTTP/1.1 connections per host, shared across ALL tabs. With several
    // tabs open, page loads and client-side navigations would queue forever
    // behind the streams. So only hold the stream while this tab is visible.
    let es: EventSource | null = null;

    const connect = () => {
      if (es) return;
      setStatus("connecting");
      es = new EventSource("/api/alerts/stream");
      es.onopen = () => setStatus("live");
      es.onmessage = (e) => {
        try {
          const a = JSON.parse(e.data) as Alert;
          setAlerts((prev) => [a, ...prev].slice(0, 4));
        } catch { /* ignore */ }
      };
      es.addEventListener("unavailable", () => setStatus("offline"));
      es.onerror = () => setStatus("offline");
    };
    const disconnect = () => {
      es?.close();
      es = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? connect() : disconnect());

    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", disconnect);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", disconnect);
      disconnect();
    };
  }, []);

  return (
    <>
      <span title="Live alert stream (Redis Pub/Sub)" className="inline-flex items-center gap-1.5 text-xs text-slate-400">
        <span className={`h-2 w-2 rounded-full ${status === "live" ? "bg-emerald-400" : status === "connecting" ? "bg-amber-400" : "bg-slate-500"}`} />
        {status === "live" ? "Live alerts" : status === "connecting" ? "Connecting" : "Alerts offline"}
      </span>
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {alerts.map((a) => (
          <div key={a.id} className={`pointer-events-auto rounded-lg border p-3 text-sm shadow-lg ${STYLE[a.type] ?? "border-slate-200 bg-white"}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide">{a.type.replace("_", " ")}</div>
                <div className="mt-0.5">{a.message}</div>
              </div>
              <button onClick={() => setAlerts((p) => p.filter((x) => x.id !== a.id))} className="text-lg leading-none opacity-50 hover:opacity-100" aria-label="Dismiss">×</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
