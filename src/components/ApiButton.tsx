"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const VARIANTS = {
  primary: "bg-slate-900 text-white hover:bg-slate-700",
  success: "bg-emerald-600 text-white hover:bg-emerald-500",
  danger: "bg-white text-red-600 ring-1 ring-red-200 hover:bg-red-50",
  ghost: "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50",
};

export default function ApiButton({
  endpoint, method = "PATCH", body, children, variant = "ghost", confirm: confirmText,
}: {
  endpoint: string; method?: "POST" | "PATCH" | "DELETE"; body?: unknown; children: React.ReactNode;
  variant?: keyof typeof VARIANTS; confirm?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(endpoint, {
        method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start">
      <button type="button" onClick={run} disabled={busy}
        className={`rounded-md px-2 py-1 text-xs font-medium shadow-sm disabled:opacity-50 ${VARIANTS[variant]}`}>
        {busy ? "…" : children}
      </button>
      {error && <span className="mt-1 max-w-xs whitespace-normal text-[11px] text-red-600">{error}</span>}
    </span>
  );
}
