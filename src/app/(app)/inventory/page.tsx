import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { inventoryAudit, listCentres, listInventory, listItems } from "@/lib/queries";
import { can } from "@/lib/constants";
import { Badge, Card, PageHeader, Table, Td } from "@/components/ui";
import ApiForm from "@/components/ApiForm";
import Disclosure from "@/components/Disclosure";
import { date, dateTime, daysUntil, num } from "@/lib/format";

const FLAGS = [
  { value: undefined, label: "All batches" },
  { value: "low", label: "Below threshold" },
  { value: "expiry", label: "Expiring ≤ 30d" },
  { value: "expired", label: "Expired" },
];

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ centre_id?: string; flag?: string }> }) {
  const sp = await searchParams;
  const user = (await getCurrentUser())!;
  const centreId = sp.centre_id ? Number(sp.centre_id) : undefined;
  const [rows, centres, items, audit] = await Promise.all([
    listInventory({ centreId, flag: sp.flag }), listCentres(), listItems(), inventoryAudit(undefined, 25),
  ]);
  const canManage = can(user.role, "manageInventory");
  const myCentres = centres.filter((c) => c.is_active && (user.role === "ADMIN" || c.manager_id === user.id));
  const editable = new Set(myCentres.map((c) => c.centre_id));
  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ centre_id: sp.centre_id, flag: sp.flag, ...o }).filter(([, v]) => v) as [string, string][]);
    return `/inventory${p.toString() ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Inventory & Expiry Ledger"
        subtitle="Per-centre batch stock. Allocations consume batches First-Expired-First-Out; expired batches are never allocated." />

      {canManage && myCentres.length > 0 && (
        <Card title="Restock / receive goods" className="mb-6">
          <ApiForm endpoint="/api/inventory" columns={4} submitLabel="Record restock" successMessage="Stock recorded and audited" fields={[
            { name: "centre_id", label: "Centre", type: "select", required: true, options: myCentres.map((c) => ({ value: c.centre_id, label: c.centre_name })) },
            { name: "item_id", label: "Item", type: "select", required: true,
              options: items.map((i) => ({ value: i.item_id, label: `${i.item_name} (${i.unit_of_measure}${i.is_perishable ? ", perishable" : ""})` })) },
            { name: "quantity", label: "Quantity", type: "number", min: 1, required: true },
            { name: "expiry_date", label: "Expiry date (perishables)", type: "date" },
            { name: "reorder_threshold", label: "Reorder threshold (optional)", type: "number", min: 0 },
          ]} />
          <p className="mt-2 text-xs text-slate-500">Restocking an existing centre/item/expiry batch tops it up; a new expiry date creates a new batch.</p>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-1">
          {FLAGS.map((f) => (
            <Link key={f.label} href={qs({ flag: f.value ?? "" })}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${(sp.flag ?? "") === (f.value ?? "") ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>{f.label}</Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          <Link href={qs({ centre_id: "" })} className={`rounded-md px-2.5 py-1 text-xs ${!centreId ? "bg-sky-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>All centres</Link>
          {centres.map((c) => (
            <Link key={c.centre_id} href={qs({ centre_id: String(c.centre_id) })}
              className={`rounded-md px-2.5 py-1 text-xs ${centreId === c.centre_id ? "bg-sky-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>{c.centre_name}</Link>
          ))}
        </div>
      </div>

      <Card bodyClass="" className="mb-6">
        <Table head={["Batch", "Centre", "Item", "Category", "Available", "Reserved", "Threshold", "Expiry", "Flags", "Updated", ""]} empty={rows.length === 0}>
          {rows.map((b) => {
            const d = daysUntil(b.expiry_date);
            return (
              <tr key={b.inventory_id} className={b.is_expired ? "bg-slate-50 text-slate-400" : ""}>
                <Td className="font-mono text-xs">#{b.inventory_id}</Td>
                <Td>{b.centre_name}</Td>
                <Td><div className="font-medium">{b.item_name}</div><div className="font-mono text-[11px] text-slate-400">{b.sku}</div></Td>
                <Td>{b.category_name}</Td>
                <Td className={`font-semibold tabular-nums ${b.is_low_stock ? "text-red-600" : ""}`}>{num(b.quantity_available)} <span className="text-xs font-normal text-slate-400">{b.unit_of_measure}</span></Td>
                <Td className="tabular-nums">{num(b.quantity_reserved)}</Td>
                <Td className="tabular-nums">{num(b.reorder_threshold)}</Td>
                <Td>{b.expiry_date ? <>{date(b.expiry_date)} <span className="text-xs text-slate-400">({d}d)</span></> : <span className="text-slate-400">n/a</span>}</Td>
                <Td><div className="flex gap-1">
                  {b.is_expired && <Badge tone="slate">Expired</Badge>}
                  {b.is_near_expiry && <Badge tone="amber">Near expiry</Badge>}
                  {b.is_low_stock && !b.is_expired && <Badge tone="red">Low stock</Badge>}
                </div></Td>
                <Td className="text-xs text-slate-500">{dateTime(b.last_updated)}</Td>
                <Td>{canManage && editable.has(b.centre_id) && (
                  <Disclosure label="Adjust" align="right">
                    <ApiForm endpoint={`/api/inventory/${b.inventory_id}`} method="PATCH" compact columns={2} onDoneReset={false} fields={[
                      { name: "delta", label: "Δ quantity (±)", type: "number", placeholder: "-5 spoilage / +3 recount" },
                      { name: "reorder_threshold", label: "Reorder threshold", type: "number", min: 0, defaultValue: b.reorder_threshold },
                    ]} />
                  </Disclosure>
                )}</Td>
              </tr>
            );
          })}
        </Table>
      </Card>

      <Card title="Inventory audit trail (append-only)" bodyClass="">
        <Table head={["Log", "When", "Centre", "Item / batch", "Change", "Δ", "By"]} empty={audit.length === 0}>
          {audit.map((l) => (
            <tr key={l.log_id}>
              <Td className="font-mono text-xs">{l.log_id}</Td>
              <Td className="text-xs">{dateTime(l.logged_at)}</Td>
              <Td>{l.centre_name}</Td>
              <Td>{l.item_name} <span className="font-mono text-[11px] text-slate-400">#{l.inventory_id}{l.expiry_date ? ` · exp ${date(l.expiry_date)}` : ""}</span></Td>
              <Td><Badge value={l.change_type} /></Td>
              <Td className={`font-mono tabular-nums ${l.quantity_delta > 0 ? "text-emerald-600" : "text-red-600"}`}>{l.quantity_delta > 0 ? "+" : ""}{l.quantity_delta}</Td>
              <Td>{l.changed_by_name ?? "system"}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
