import Link from "next/link";
import type { ReactNode } from "react";
import { label } from "@/lib/format";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "", bodyClass = "p-4" }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string;
}) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actions}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

const TONES: Record<string, string> = {
  red: "bg-red-50 text-red-700 ring-red-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

const VALUE_TONE: Record<string, keyof typeof TONES> = {
  CRITICAL: "red", HIGH: "amber", MODERATE: "blue", MEDIUM: "blue", LOW: "slate",
  ACTIVE: "red", CONTAINED: "amber", RESOLVED: "green",
  STABILISED: "blue", CLEARED: "green",
  PENDING: "amber", APPROVED: "blue", PARTIALLY_FULFILLED: "violet", FULFILLED: "green", REJECTED: "slate",
  ALLOCATED: "blue", IN_TRANSIT: "violet", DELIVERED: "green", CANCELLED: "slate",
  AVAILABLE: "green", DEPLOYED: "blue", ON_LEAVE: "slate",
  RESTOCK: "green", RESERVE: "blue", DISPATCH: "violet", ADJUSTMENT: "amber",
  ADMIN: "red", CENTRE_MANAGER: "violet", COORDINATOR: "blue", VOLUNTEER: "green",
  LOW_STOCK: "amber", CRITICAL_SOS: "red", NEAR_EXPIRY: "amber",
};

export function Badge({ value, tone, children }: { value?: string; tone?: keyof typeof TONES; children?: ReactNode }) {
  const t = tone ?? (value ? VALUE_TONE[value] : undefined) ?? "slate";
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[t]}`}>
      {children ?? label(value)}
    </span>
  );
}

export function Stat({ label: l, value, hint, tone = "slate", href }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: "slate" | "red" | "amber" | "green" | "blue"; href?: string;
}) {
  const accent = { slate: "border-l-slate-300", red: "border-l-red-500", amber: "border-l-amber-500", green: "border-l-emerald-500", blue: "border-l-sky-500" }[tone];
  const body = (
    <div className={`h-full rounded-lg border border-l-4 border-slate-200 ${accent} bg-white p-4 shadow-sm transition hover:shadow`}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{l}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {empty ? (
            <tr><td colSpan={head.length} className="px-3 py-8 text-center text-slate-400">Nothing to show.</td></tr>
          ) : children}
        </tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap px-3 py-2 align-middle text-slate-700 ${className}`}>{children}</td>;
}

export function Progress({ value, max, tone }: { value: number; max: number; tone?: "auto" | "blue" }) {
  const pct = max > 0 ? Math.min(100, Math.round((100 * value) / max)) : 0;
  const color = tone === "blue" ? "bg-sky-500" : pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-500">{pct}%</span>
    </div>
  );
}

export function FilterLinks({ base, param, options, current }: {
  base: string; param: string; options: { value?: string; label: string }[]; current?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => {
        const active = (o.value ?? "") === (current ?? "");
        const href = o.value ? `${base}?${param}=${encodeURIComponent(o.value)}` : base;
        return (
          <Link key={o.label} href={href}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${active ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}

export function SourceTag({ source }: { source: "redis" | "postgres" }) {
  return (
    <span title={source === "redis" ? "Served from Redis" : "Redis unavailable — served from PostgreSQL"}
      className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${source === "redis" ? "bg-red-50 text-red-600" : "bg-sky-50 text-sky-700"}`}>
      {source}
    </span>
  );
}
