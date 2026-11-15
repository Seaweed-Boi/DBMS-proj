"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export type Field = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "email" | "password" | "textarea" | "select" | "checkbox";
  options?: { value: string | number; label: string }[];
  required?: boolean;
  defaultValue?: string | number | boolean | null;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number | string;
  span?: 1 | 2;
};

/**
 * Generic JSON form posting to an API route. On success it refreshes
 * server components so pages re-query PostgreSQL / Redis.
 */
export default function ApiForm({
  endpoint, method = "POST", fields, submitLabel = "Save", onDoneReset = true, columns = 2, compact = false, successMessage,
}: {
  endpoint: string; method?: "POST" | "PATCH"; fields: Field[]; submitLabel?: string;
  onDoneReset?: boolean; columns?: 1 | 2 | 3 | 4; compact?: boolean; successMessage?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const body: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.type === "checkbox") body[f.name] = data.get(f.name) === "on";
      else {
        const v = data.get(f.name);
        if (v === null || v === "") {
          if (method === "POST") continue;
          body[f.name] = null;
        } else body[f.name] = f.type === "number" ? Number(v) : v;
      }
    }
    setBusy(true); setError(null); setOk(null);
    try {
      const res = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      if (onDoneReset) form.reset();
      setOk(successMessage ?? "Saved");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const grid = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" }[columns];
  const input = `w-full rounded-md border border-slate-300 bg-white px-2.5 ${compact ? "py-1 text-xs" : "py-1.5 text-sm"} text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500`;

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className={`grid grid-cols-1 gap-3 ${grid}`}>
        {fields.map((f) => (
          <label key={f.name} className={`block ${f.span === 2 ? "sm:col-span-2" : ""} ${f.type === "checkbox" ? "flex items-center gap-2 self-end" : ""}`}>
            {f.type !== "checkbox" && (
              <span className="mb-1 block text-xs font-medium text-slate-600">{f.label}{f.required && <span className="text-red-500"> *</span>}</span>
            )}
            {f.type === "select" ? (
              <select name={f.name} required={f.required} defaultValue={f.defaultValue == null ? "" : String(f.defaultValue)} className={input}>
                {!f.required && <option value="">—</option>}
                {f.required && f.defaultValue == null && <option value="" disabled>Select…</option>}
                {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : f.type === "textarea" ? (
              <textarea name={f.name} required={f.required} defaultValue={f.defaultValue == null ? "" : String(f.defaultValue)}
                placeholder={f.placeholder} rows={2} className={input} />
            ) : f.type === "checkbox" ? (
              <>
                <input type="checkbox" name={f.name} defaultChecked={!!f.defaultValue} className="h-4 w-4 rounded border-slate-300" />
                <span className="text-xs font-medium text-slate-600">{f.label}</span>
              </>
            ) : (
              <input name={f.name} type={f.type ?? "text"} required={f.required} placeholder={f.placeholder}
                defaultValue={f.defaultValue == null ? undefined : String(f.defaultValue)}
                min={f.min} max={f.max} step={f.step} className={input} />
            )}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy}
          className={`rounded-md bg-slate-900 font-medium text-white shadow-sm hover:bg-slate-700 disabled:opacity-50 ${compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"}`}>
          {busy ? "Working…" : submitLabel}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
        {ok && !error && <span className="text-xs text-emerald-600">{ok}</span>}
      </div>
    </form>
  );
}
