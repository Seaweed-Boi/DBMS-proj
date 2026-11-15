"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Modal from "./Modal";

type Eligible = {
  centre_id: number; centre_name: string; district: string; usable_quantity: number;
  batches: number; earliest_expiry: string | null; same_district: boolean;
};

/**
 * Shows centres holding usable stock for a request and executes an
 * atomic FEFO allocation (POST /api/allocations).
 */
export default function AllocatePanel({ requestId, outstanding, allowedCentreIds }: {
  requestId: number; outstanding: number; allowedCentreIds: number[] | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [centres, setCentres] = useState<Eligible[] | null>(null);
  const [centreId, setCentreId] = useState<number | null>(null);
  const [qty, setQty] = useState(outstanding);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function openPanel() {
    setOpen(true); setError(null); setCentres(null);
    const res = await fetch(`/api/requests/${requestId}/eligible-centres`);
    const json = await res.json();
    if (!res.ok) { setError(json.error); return; }
    const list: Eligible[] = json.centres;
    setCentres(list);
    const first = list.find((c) => !allowedCentreIds || allowedCentreIds.includes(c.centre_id));
    if (first) { setCentreId(first.centre_id); setQty(Math.min(outstanding, first.usable_quantity)); }
  }

  async function submit() {
    if (!centreId) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/allocations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_id: requestId, centre_id: centreId, quantity: qty }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(json.error ?? "Allocation failed"); return; }
    setOpen(false); setCentres(null);
    router.refresh();
  }

  return (
    <div className="text-right">
      <button onClick={openPanel} className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white shadow-sm hover:bg-emerald-500">
        Allocate
      </button>
      {open && (
        <Modal title={`Allocate stock to request #${requestId}`} onClose={() => setOpen(false)}>
          <div className="mb-2 text-xs font-semibold text-slate-700">Eligible centres (usable, non-expired stock)</div>
          {!centres && !error && <div className="text-xs text-slate-400">Loading…</div>}
          {centres?.length === 0 && <div className="text-xs text-red-600">No active centre holds usable stock of this item.</div>}
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {centres?.map((c) => {
              const allowed = !allowedCentreIds || allowedCentreIds.includes(c.centre_id);
              return (
                <label key={c.centre_id} className={`flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-xs ${centreId === c.centre_id ? "bg-sky-50 ring-1 ring-sky-200" : "hover:bg-slate-50"} ${allowed ? "" : "cursor-not-allowed opacity-40"}`}>
                  <span className="flex items-center gap-2">
                    <input type="radio" name={`centre-${requestId}`} disabled={!allowed} checked={centreId === c.centre_id}
                      onChange={() => { setCentreId(c.centre_id); setQty(Math.min(outstanding, c.usable_quantity)); }} />
                    <span>
                      <span className="font-medium text-slate-800">{c.centre_name}</span>
                      {c.same_district && <span className="ml-1 rounded bg-emerald-50 px-1 text-[10px] text-emerald-700">same district</span>}
                      <span className="block text-slate-400">{c.batches} batch{c.batches > 1 ? "es" : ""}{c.earliest_expiry ? ` · FEFO from ${c.earliest_expiry}` : ""}</span>
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums text-slate-700">{c.usable_quantity}</span>
                </label>
              );
            })}
          </div>
          {centres && centres.length > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <input type="number" min={1} max={outstanding} value={qty} onChange={(e) => setQty(Number(e.target.value))}
                className="w-24 rounded-md border border-slate-300 px-2 py-1 text-xs" />
              <span className="text-xs text-slate-400">of {outstanding} outstanding</span>
              <button onClick={submit} disabled={busy || !centreId || qty < 1}
                className="ml-auto rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
                {busy ? "Allocating…" : "Confirm allocation"}
              </button>
            </div>
          )}
          {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
        </Modal>
      )}
    </div>
  );
}
