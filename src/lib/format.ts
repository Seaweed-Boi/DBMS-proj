export function label(v: string | null | undefined) {
  if (!v) return "—";
  return v.toLowerCase().split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

export function num(v: number | null | undefined) {
  return v === null || v === undefined ? "—" : new Intl.NumberFormat("en-IN").format(v);
}

export function date(v: string | Date | null | undefined) {
  if (!v) return "—";
  const d = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function dateTime(v: string | Date | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function ago(v: string | Date) {
  const s = Math.round((Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function daysUntil(v: string | null) {
  if (!v) return null;
  const d = new Date(`${v}T00:00:00`).getTime();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((d - today.getTime()) / 86400000);
}
