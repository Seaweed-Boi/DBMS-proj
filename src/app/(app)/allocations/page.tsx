import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listAllocations, listCentres } from "@/lib/queries";
import { can, DISPATCH_STATUSES } from "@/lib/constants";
import { Badge, Card, FilterLinks, PageHeader, Table, Td } from "@/components/ui";
import ApiButton from "@/components/ApiButton";
import { date, dateTime, label, num } from "@/lib/format";

export default async function AllocationsPage({ searchParams }: { searchParams: Promise<{ status?: string; request_id?: string }> }) {
  const sp = await searchParams;
  const user = (await getCurrentUser())!;
  const status = sp.status && (DISPATCH_STATUSES as readonly string[]).includes(sp.status) ? sp.status : undefined;
  const requestId = sp.request_id ? Number(sp.request_id) : undefined;
  const [rows, centres] = await Promise.all([listAllocations({ status, requestId }), listCentres()]);
  const canDispatch = can(user.role, "updateDispatch");
  const mine = new Set(centres.filter((c) => user.role === "ADMIN" || c.manager_id === user.id).map((c) => c.centre_id));

  return (
    <>
      <PageHeader title="Dispatch Tracker"
        subtitle={<>Allocation lifecycle: Allocated → In Transit → Delivered, or Cancelled (stock returns to its original batches).
          {requestId && <> Showing request <b>#{requestId}</b> · <Link href="/allocations" className="text-sky-700 hover:underline">clear</Link></>}</>} />

      <Card bodyClass="" actions={<FilterLinks base="/allocations" param="status" current={status}
        options={[{ label: "All" }, ...DISPATCH_STATUSES.map((s) => ({ value: s, label: label(s) }))]} />} title="Allocations">
        <Table head={["#", "Request", "Destination", "Source centre", "Item", "Qty", "FEFO batches", "Status", "Approved", "Delivered", ""]} empty={rows.length === 0}>
          {rows.map((a) => {
            const active = a.dispatch_status === "ALLOCATED" || a.dispatch_status === "IN_TRANSIT";
            return (
              <tr key={a.allocation_id}>
                <Td className="font-mono text-xs">{a.allocation_id}</Td>
                <Td><span className="font-mono text-xs">#{a.request_id}</span> <Badge value={a.urgency_level} /></Td>
                <Td><div className="font-medium">{a.zone_name}</div><div className="text-xs text-slate-400">{a.district}</div></Td>
                <Td>{a.centre_name}</Td>
                <Td>{a.item_name}</Td>
                <Td className="font-semibold tabular-nums">{num(a.quantity_allocated)}</Td>
                <Td className="text-xs">
                  {a.batches.map((b) => (
                    <div key={b.inventory_id} className="font-mono text-slate-500">#{b.inventory_id}: {b.quantity}{b.expiry_date ? ` (exp ${date(b.expiry_date)})` : ""}</div>
                  ))}
                </Td>
                <Td><Badge value={a.dispatch_status} /></Td>
                <Td className="text-xs text-slate-500">{dateTime(a.allocated_at)}<div>{a.approved_by_name}</div></Td>
                <Td className="text-xs text-slate-500">{dateTime(a.delivered_at)}</Td>
                <Td>{canDispatch && active && mine.has(a.centre_id) && (
                  <div className="flex justify-end gap-2">
                    {a.dispatch_status === "ALLOCATED" && (
                      <ApiButton endpoint={`/api/allocations/${a.allocation_id}`} body={{ dispatch_status: "IN_TRANSIT" }} variant="primary">Dispatch</ApiButton>
                    )}
                    <ApiButton endpoint={`/api/allocations/${a.allocation_id}`} body={{ dispatch_status: "DELIVERED" }} variant="success">Delivered</ApiButton>
                    <ApiButton endpoint={`/api/allocations/${a.allocation_id}`} body={{ dispatch_status: "CANCELLED" }} variant="danger"
                      confirm="Cancel this allocation? Reserved stock returns to its batches and the request is re-opened.">Cancel</ApiButton>
                  </div>
                )}</Td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
