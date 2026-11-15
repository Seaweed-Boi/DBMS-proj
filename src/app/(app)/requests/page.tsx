import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getQueue } from "@/lib/services/queue";
import { listCentres, listItems, listRequests, listZones } from "@/lib/queries";
import { can, REQUEST_STATUSES, URGENCY_LEVELS } from "@/lib/constants";
import { Badge, Card, FilterLinks, PageHeader, SourceTag, Table, Td } from "@/components/ui";
import ApiForm from "@/components/ApiForm";
import ApiButton from "@/components/ApiButton";
import AllocatePanel from "@/components/AllocatePanel";
import { ago, dateTime, label, num } from "@/lib/format";

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const user = (await getCurrentUser())!;
  const status = sp.status && (REQUEST_STATUSES as readonly string[]).includes(sp.status) ? sp.status : undefined;
  const [queue, history, zones, items, centres] = await Promise.all([
    getQueue(50), listRequests({ status }), listZones(), listItems(), listCentres(),
  ]);
  const reviewer = can(user.role, "reviewRequests");
  const allocator = can(user.role, "allocate");
  const allowedCentres = user.role === "ADMIN" ? null : centres.filter((c) => c.manager_id === user.id).map((c) => c.centre_id);
  const openZones = zones.filter((z) => z.status !== "CLEARED");

  return (
    <>
      <PageHeader title="Priority Request & Allocation Console"
        subtitle="Open requests ranked by the Redis urgency queue — urgency tier, zone urgency score and affected population." />

      {can(user.role, "submitRequests") && (
        <Card title="Log a relief request" className="mb-6">
          <ApiForm endpoint="/api/requests" columns={4} submitLabel="Submit request" successMessage="Request queued" fields={[
            { name: "zone_id", label: "Affected zone", type: "select", required: true,
              options: openZones.map((z) => ({ value: z.zone_id, label: `${z.zone_name} — ${z.disaster_title}` })) },
            { name: "item_id", label: "Resource item", type: "select", required: true,
              options: items.map((i) => ({ value: i.item_id, label: `${i.item_name} (${i.unit_of_measure})` })) },
            { name: "quantity_requested", label: "Quantity", type: "number", min: 1, required: true },
            { name: "urgency_level", label: "Urgency", type: "select", required: true, defaultValue: "HIGH",
              options: URGENCY_LEVELS.map((u) => ({ value: u, label: label(u) })) },
            { name: "notes", label: "Ground notes / delivery instructions", type: "textarea", span: 2 },
          ]} />
          <p className="mt-2 text-xs text-slate-500">CRITICAL requests broadcast an SOS alert to every connected dashboard.</p>
        </Card>
      )}

      <Card className="mb-6" bodyClass="" title={<span className="flex items-center gap-2">Triage queue <SourceTag source={queue.source} /> <span className="font-normal text-slate-400">{queue.entries.length} open</span></span>}>
        <Table head={["Rank", "Zone", "Item", "Fulfilled / req.", "Urgency", "Status", "Priority", "Logged", ""]} empty={queue.entries.length === 0}>
          {queue.entries.map((r, i) => (
            <tr key={r.request_id} className={r.urgency_level === "CRITICAL" ? "bg-red-50/40" : ""}>
              <Td><span className="font-semibold tabular-nums text-slate-700">{i + 1}</span> <span className="font-mono text-xs text-slate-400">#{r.request_id}</span></Td>
              <Td><div className="font-medium">{r.zone_name}</div><div className="text-xs text-slate-400">{r.district}</div></Td>
              <Td>{r.item_name}{r.notes && <div className="max-w-[14rem] truncate text-xs text-slate-400" title={r.notes}>{r.notes}</div>}</Td>
              <Td className="tabular-nums">{num(r.quantity_fulfilled)} / {num(r.quantity_requested)}</Td>
              <Td><Badge value={r.urgency_level} /></Td>
              <Td><Badge value={r.status} /></Td>
              <Td className="tabular-nums text-slate-500">{r.priority_score.toFixed(1)}</Td>
              <Td className="text-xs text-slate-500">{ago(r.created_at)}<div className="text-slate-400">{r.requested_by_name}</div></Td>
              <Td>
                <div className="flex items-start justify-end gap-1.5">
                  {reviewer && r.status === "PENDING" && (
                    <ApiButton endpoint={`/api/requests/${r.request_id}`} body={{ action: "approve" }} variant="primary">Approve</ApiButton>
                  )}
                  {reviewer && r.quantity_fulfilled === 0 && (
                    <ApiButton endpoint={`/api/requests/${r.request_id}`} body={{ action: "reject" }} variant="danger" confirm={`Reject request #${r.request_id}?`}>Reject</ApiButton>
                  )}
                  {allocator && (
                    <AllocatePanel requestId={r.request_id} outstanding={r.quantity_outstanding} allowedCentreIds={allowedCentres} />
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card bodyClass="" title="All requests" actions={
        <FilterLinks base="/requests" param="status" current={status}
          options={[{ label: "All" }, ...REQUEST_STATUSES.map((s) => ({ value: s, label: label(s) }))]} />
      }>
        <Table head={["#", "Disaster / zone", "Item", "Fulfilment", "Urgency", "Status", "Submitted", ""]} empty={history.length === 0}>
          {history.map((r) => (
            <tr key={r.request_id}>
              <Td className="font-mono text-xs">{r.request_id}</Td>
              <Td><div className="font-medium">{r.zone_name}</div><div className="text-xs text-slate-400">{r.disaster_title}</div></Td>
              <Td>{r.item_name}</Td>
              <Td className="tabular-nums">{num(r.quantity_fulfilled)} / {num(r.quantity_requested)} <span className="text-xs text-slate-400">{r.unit_of_measure}</span></Td>
              <Td><Badge value={r.urgency_level} /></Td>
              <Td><Badge value={r.status} /></Td>
              <Td className="text-xs text-slate-500">{dateTime(r.created_at)}<div>{r.requested_by_name}</div></Td>
              <Td>
                <div className="flex justify-end gap-2">
                  <Link href={`/allocations?request_id=${r.request_id}`} className="text-xs text-sky-700 hover:underline">Allocations</Link>
                  {reviewer && r.status === "REJECTED" && (
                    <ApiButton endpoint={`/api/requests/${r.request_id}`} body={{ action: "reopen" }}>Reopen</ApiButton>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
