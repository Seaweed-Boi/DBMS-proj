import { categoryStock, dispatchSummary, inventoryAudit, requestTurnaround, zoneFulfillment } from "@/lib/queries";
import { Badge, Card, PageHeader, Progress, Table, Td } from "@/components/ui";
import { dateTime, num } from "@/lib/format";
import ApiButton from "@/components/ApiButton";
import { getCurrentUser } from "@/lib/auth";

export default async function ReportsPage() {
  const user = (await getCurrentUser())!;
  const [zones, dispatch, categories, turnaround, audit] = await Promise.all([
    zoneFulfillment(), dispatchSummary(), categoryStock(), requestTurnaround(), inventoryAudit(undefined, 15),
  ]);

  return (
    <>
      <PageHeader title="Reports & Analytics" subtitle="Aggregated from PostgreSQL views: inventory health, zone coverage, request turnaround and dispatch performance."
        actions={user.role === "ADMIN" && (
          <ApiButton endpoint="/api/admin/redis-rebuild" method="POST" variant="ghost">Rebuild Redis caches from PostgreSQL</ApiButton>
        )} />

      <div className="grid gap-6">
        <Card title="Zone fulfilment (v_zone_fulfillment)" bodyClass="">
          <Table head={["Zone", "Disaster", "Status", "Urgency", "Population", "Requests", "Units fulfilled / requested", "Fulfilment"]} empty={zones.length === 0}>
            {zones.map((z) => (
              <tr key={z.zone_id}>
                <Td className="font-medium">{z.zone_name}<div className="text-xs text-slate-400">{z.district}</div></Td>
                <Td>{z.disaster_title}</Td>
                <Td><Badge value={z.zone_status} /></Td>
                <Td className="tabular-nums">{z.urgency_score.toFixed(1)}</Td>
                <Td className="tabular-nums">{num(z.affected_population)}</Td>
                <Td className="tabular-nums">{z.fulfilled_requests} / {z.total_requests}</Td>
                <Td className="tabular-nums">{num(z.units_fulfilled)} / {num(z.units_requested)}</Td>
                <Td>{z.fulfillment_pct === null ? <span className="text-slate-400">no requests</span> : <Progress value={z.units_fulfilled} max={z.units_requested} tone="blue" />}</Td>
              </tr>
            ))}
          </Table>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card title="Inventory health by category" bodyClass="">
            <Table head={["Category", "Available", "Reserved", "Low-stock batches", "Units expiring ≤30d"]} empty={categories.length === 0}>
              {categories.map((c) => (
                <tr key={c.category_name}>
                  <Td className="font-medium">{c.category_name}</Td>
                  <Td className="tabular-nums">{num(c.available)} <span className="text-xs text-slate-400">{c.unit_of_measure}</span></Td>
                  <Td className="tabular-nums">{num(c.reserved)}</Td>
                  <Td>{c.low_stock_batches ? <Badge tone="red">{c.low_stock_batches}</Badge> : "0"}</Td>
                  <Td>{c.near_expiry_units ? <Badge tone="amber">{num(c.near_expiry_units)}</Badge> : "0"}</Td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card title="Request turnaround by urgency" bodyClass="">
            <Table head={["Urgency", "Requests", "Allocated", "Avg h → first allocation", "Avg h → delivery"]} empty={turnaround.length === 0}>
              {turnaround.map((t) => (
                <tr key={t.urgency_level}>
                  <Td><Badge value={t.urgency_level} /></Td>
                  <Td className="tabular-nums">{t.requests}</Td>
                  <Td className="tabular-nums">{t.allocated_requests}</Td>
                  <Td className="tabular-nums">{t.avg_hours_to_first_allocation ?? "—"}</Td>
                  <Td className="tabular-nums">{t.avg_hours_to_delivery ?? "—"}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card title="Dispatch performance by centre (v_dispatch_summary)" bodyClass="">
            <Table head={["Centre", "Allocated", "In transit", "Delivered", "Cancelled", "Units delivered", "Avg delivery (h)"]} empty={dispatch.length === 0}>
              {dispatch.map((d) => (
                <tr key={d.centre_id}>
                  <Td className="font-medium">{d.centre_name}</Td>
                  <Td className="tabular-nums">{d.allocated}</Td><Td className="tabular-nums">{d.in_transit}</Td>
                  <Td className="tabular-nums">{d.delivered}</Td><Td className="tabular-nums">{d.cancelled}</Td>
                  <Td className="tabular-nums">{num(d.units_delivered)}</Td>
                  <Td className="tabular-nums">{d.avg_delivery_hours ?? "—"}</Td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card title="Latest stock movements" bodyClass="">
            <Table head={["When", "Centre", "Item", "Change", "Δ"]} empty={audit.length === 0}>
              {audit.map((l) => (
                <tr key={l.log_id}>
                  <Td className="text-xs">{dateTime(l.logged_at)}</Td><Td>{l.centre_name}</Td><Td>{l.item_name}</Td>
                  <Td><Badge value={l.change_type} /></Td>
                  <Td className={`font-mono ${l.quantity_delta > 0 ? "text-emerald-600" : "text-red-600"}`}>{l.quantity_delta > 0 ? "+" : ""}{l.quantity_delta}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      </div>
    </>
  );
}
