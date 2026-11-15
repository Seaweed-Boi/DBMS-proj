import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getKpis } from "@/lib/services/kpi";
import { getQueue } from "@/lib/services/queue";
import { recentAlerts } from "@/lib/services/alerts";
import { dispatchSummary, listCentres, listInventory } from "@/lib/queries";
import { Badge, Card, PageHeader, Progress, SourceTag, Stat, Table, Td } from "@/components/ui";
import { ago, date, daysUntil, num } from "@/lib/format";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const [user, sp] = [await getCurrentUser(), await searchParams];
  const [{ kpis, source: kpiSource }, queue, alerts, lowStock, nearExpiry, centres, dispatch] = await Promise.all([
    getKpis(), getQueue(6), recentAlerts(8),
    listInventory({ flag: "low" }), listInventory({ flag: "expiry" }), listCentres(), dispatchSummary(),
  ]);

  return (
    <>
      <PageHeader
        title="Executive Command Dashboard"
        subtitle={<>Welcome back, {user?.name}. Live operational picture across all active incidents.</>}
        actions={<span className="flex items-center gap-2 text-xs text-slate-500">KPIs <SourceTag source={kpiSource} /></span>}
      />
      {sp.denied && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Your role does not have access to that page.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Active Disasters" value={kpis.active_disasters} tone="red" href="/disasters"
          hint={`${num(kpis.affected_population)} people affected`} />
        <Stat label="Pending Critical Requests" value={kpis.pending_critical_requests} tone="red" href="/requests"
          hint={`${kpis.open_requests} open requests in total`} />
        <Stat label="Total Allocated Units" value={num(kpis.total_allocated_units)} tone="blue" href="/allocations"
          hint={`${num(kpis.units_in_pipeline)} in pipeline · ${num(kpis.units_delivered)} delivered`} />
        <Stat label="Available Volunteers" value={kpis.available_volunteers} tone="green" href="/volunteers"
          hint={`${kpis.deployed_volunteers} currently deployed`} />
        <Stat label="Low-Stock Batches" value={kpis.low_stock_batches} tone="amber" href="/inventory?flag=low" />
        <Stat label="Expiring ≤ 30 days" value={kpis.near_expiry_batches} tone="amber" href="/inventory?flag=expiry" />
        <Stat label="Shelter Occupancy" value={`${kpis.shelter_occupancy_pct}%`} href="/centres" />
        <Stat label="Relief Centres" value={centres.filter((c) => c.is_active).length} hint="active" href="/centres" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" title={<span className="flex items-center gap-2">Most urgent open requests <SourceTag source={queue.source} /></span>}
          actions={<Link href="/requests" className="text-xs font-medium text-sky-700 hover:underline">Open console →</Link>} bodyClass="">
          <Table head={["#", "Zone", "Item", "Outstanding", "Urgency", "Priority", "Age"]} empty={queue.entries.length === 0}>
            {queue.entries.map((r) => (
              <tr key={r.request_id}>
                <Td className="font-mono text-xs">{r.request_id}</Td>
                <Td><div className="font-medium">{r.zone_name}</div><div className="text-xs text-slate-400">{r.district}</div></Td>
                <Td>{r.item_name}</Td>
                <Td className="tabular-nums">{num(r.quantity_outstanding)}</Td>
                <Td><Badge value={r.urgency_level} /></Td>
                <Td className="tabular-nums text-slate-500">{r.priority_score.toFixed(0)}</Td>
                <Td className="text-xs text-slate-500">{ago(r.created_at)}</Td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="Recent alerts" bodyClass="divide-y divide-slate-100">
          {alerts.length === 0 && <p className="p-4 text-sm text-slate-400">No alerts yet.</p>}
          {alerts.map((a) => (
            <div key={a.id} className="px-4 py-3 text-sm">
              <div className="flex items-center justify-between"><Badge value={a.type} /><span className="text-xs text-slate-400">{ago(a.at)}</span></div>
              <p className="mt-1 text-slate-700">{a.message}</p>
            </div>
          ))}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Below reorder threshold" actions={<Link href="/inventory?flag=low" className="text-xs text-sky-700 hover:underline">All →</Link>} bodyClass="">
          <Table head={["Centre", "Item", "Available", "Threshold"]} empty={lowStock.length === 0}>
            {lowStock.slice(0, 6).map((b) => (
              <tr key={b.inventory_id}>
                <Td>{b.centre_name}</Td><Td>{b.item_name}</Td>
                <Td className="font-semibold tabular-nums text-red-600">{num(b.quantity_available)}</Td>
                <Td className="tabular-nums">{num(b.reorder_threshold)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Perishables nearing expiry (FEFO first)" actions={<Link href="/inventory?flag=expiry" className="text-xs text-sky-700 hover:underline">All →</Link>} bodyClass="">
          <Table head={["Centre", "Item", "Available", "Expires"]} empty={nearExpiry.length === 0}>
            {nearExpiry.slice(0, 6).map((b) => (
              <tr key={b.inventory_id}>
                <Td>{b.centre_name}</Td><Td>{b.item_name}</Td>
                <Td className="tabular-nums">{num(b.quantity_available)}</Td>
                <Td><span className="text-amber-700">{date(b.expiry_date)}</span> <span className="text-xs text-slate-400">({daysUntil(b.expiry_date)}d)</span></Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Shelter capacity" bodyClass="">
          <Table head={["Centre", "District", "Occupancy", "Load"]} empty={centres.length === 0}>
            {centres.filter((c) => c.is_active).map((c) => (
              <tr key={c.centre_id}>
                <Td className="font-medium">{c.centre_name}</Td><Td>{c.district}</Td>
                <Td className="tabular-nums">{num(c.current_occupancy)} / {num(c.total_capacity)}</Td>
                <Td><Progress value={c.current_occupancy} max={c.total_capacity} /></Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Dispatch progress" bodyClass="">
          <Table head={["Centre", "Allocated", "In transit", "Delivered", "Units delivered"]} empty={dispatch.length === 0}>
            {dispatch.map((d) => (
              <tr key={d.centre_id}>
                <Td className="font-medium">{d.centre_name}</Td>
                <Td className="tabular-nums">{d.allocated}</Td><Td className="tabular-nums">{d.in_transit}</Td>
                <Td className="tabular-nums">{d.delivered}</Td><Td className="tabular-nums">{num(d.units_delivered)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
