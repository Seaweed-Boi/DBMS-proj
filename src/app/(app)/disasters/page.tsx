import { getCurrentUser } from "@/lib/auth";
import { listDisasters, listZones } from "@/lib/queries";
import { can, DISASTER_STATUSES, DISASTER_TYPES, SEVERITY_LEVELS, ZONE_STATUSES } from "@/lib/constants";
import { Badge, Card, PageHeader, Table, Td } from "@/components/ui";
import ApiForm from "@/components/ApiForm";
import ApiButton from "@/components/ApiButton";
import Disclosure from "@/components/Disclosure";
import { date, label, num } from "@/lib/format";

const opts = (xs: readonly string[]) => xs.map((x) => ({ value: x, label: label(x) }));

export default async function DisastersPage() {
  const user = (await getCurrentUser())!;
  const [disasters, zones] = await Promise.all([listDisasters(), listZones()]);
  const canDisaster = can(user.role, "manageDisasters");
  const canZone = can(user.role, "manageZones");

  return (
    <>
      <PageHeader title="Disaster & Zone Tracker"
        subtitle="Register incidents, map affected zones and adjust severity and urgency as field conditions evolve." />

      {canDisaster && (
        <Card title="Register a new disaster" className="mb-6">
          <ApiForm endpoint="/api/disasters" submitLabel="Register disaster" columns={4} successMessage="Disaster registered" fields={[
            { name: "title", label: "Title", required: true, placeholder: "e.g. Coastal Cyclone 2026", span: 2 },
            { name: "disaster_type", label: "Type", type: "select", required: true, options: opts(DISASTER_TYPES) },
            { name: "severity_level", label: "Severity", type: "select", required: true, options: opts(SEVERITY_LEVELS) },
            { name: "start_date", label: "Start date", type: "date", required: true },
            { name: "status", label: "Status", type: "select", required: true, defaultValue: "ACTIVE", options: opts(DISASTER_STATUSES) },
            { name: "description", label: "Situation summary", type: "textarea", span: 2 },
          ]} />
        </Card>
      )}

      <div className="space-y-6">
        {disasters.map((d) => {
          const dz = zones.filter((z) => z.disaster_id === d.disaster_id);
          return (
            <Card key={d.disaster_id} bodyClass="" title={
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-base">{d.title}</span>
                <Badge value={d.disaster_type} tone="slate" />
                <Badge value={d.severity_level} />
                <Badge value={d.status} />
              </span>
            } actions={canDisaster && (
              <div className="flex gap-2">
                <Disclosure label="Edit" align="right">
                  <ApiForm endpoint={`/api/disasters/${d.disaster_id}`} method="PATCH" onDoneReset={false} compact columns={2} fields={[
                    { name: "severity_level", label: "Severity", type: "select", required: true, defaultValue: d.severity_level, options: opts(SEVERITY_LEVELS) },
                    { name: "status", label: "Status", type: "select", required: true, defaultValue: d.status, options: opts(DISASTER_STATUSES) },
                    { name: "description", label: "Summary", type: "textarea", defaultValue: d.description, span: 2 },
                  ]} />
                </Disclosure>
                <ApiButton endpoint={`/api/disasters/${d.disaster_id}`} method="DELETE" variant="danger"
                  confirm={`Delete "${d.title}" and all its zones? This fails if requests reference them.`}>Delete</ApiButton>
              </div>
            )}>
              <div className="flex flex-wrap gap-6 border-b border-slate-100 px-4 py-3 text-sm text-slate-600">
                <span>Started <b>{date(d.start_date)}</b></span>
                <span><b>{d.zone_count}</b> zones</span>
                <span><b>{num(d.affected_population)}</b> affected</span>
                <span><b>{d.open_requests}</b> open requests</span>
                {d.description && <span className="basis-full text-slate-500">{d.description}</span>}
              </div>
              <Table head={["Zone", "District", "Population", "Urgency score", "Status", "Open req.", "Volunteers", ""]} empty={dz.length === 0}>
                {dz.map((z) => (
                  <tr key={z.zone_id}>
                    <Td className="font-medium">{z.zone_name}
                      {z.latitude !== null && <div className="font-mono text-[11px] text-slate-400">{z.latitude.toFixed(3)}, {z.longitude?.toFixed(3)}</div>}
                    </Td>
                    <Td>{z.district}</Td>
                    <Td className="tabular-nums">{num(z.affected_population)}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-slate-100"><div className="h-full rounded-full bg-red-500" style={{ width: `${z.urgency_score}%` }} /></div>
                        <span className="tabular-nums">{z.urgency_score.toFixed(1)}</span>
                      </div>
                    </Td>
                    <Td><Badge value={z.status} /></Td>
                    <Td className="tabular-nums">{z.open_requests}</Td>
                    <Td className="tabular-nums">{z.volunteers}</Td>
                    <Td>{canZone && (
                      <Disclosure label="Update" align="right">
                        <ApiForm endpoint={`/api/zones/${z.zone_id}`} method="PATCH" onDoneReset={false} compact columns={3} fields={[
                          { name: "affected_population", label: "Population", type: "number", min: 0, required: true, defaultValue: z.affected_population },
                          { name: "urgency_score", label: "Urgency (0-100)", type: "number", min: 0, max: 100, step: "0.01", required: true, defaultValue: z.urgency_score },
                          { name: "status", label: "Status", type: "select", required: true, defaultValue: z.status, options: opts(ZONE_STATUSES) },
                        ]} />
                      </Disclosure>
                    )}</Td>
                  </tr>
                ))}
              </Table>
              {canZone && d.status !== "RESOLVED" && (
                <div className="border-t border-slate-100 p-4">
                  <Disclosure label="+ Add affected zone">
                    <ApiForm endpoint="/api/zones" columns={4} compact submitLabel="Add zone" fields={[
                      { name: "disaster_id", label: "Disaster", type: "select", required: true, defaultValue: d.disaster_id,
                        options: [{ value: d.disaster_id, label: d.title }] },
                      { name: "zone_name", label: "Zone name", required: true },
                      { name: "district", label: "District", required: true },
                      { name: "affected_population", label: "Affected population", type: "number", min: 0, required: true },
                      { name: "latitude", label: "Latitude", type: "number", step: "0.000001", min: -90, max: 90 },
                      { name: "longitude", label: "Longitude", type: "number", step: "0.000001", min: -180, max: 180 },
                      { name: "urgency_score", label: "Urgency (blank = auto)", type: "number", min: 0, max: 100, step: "0.01" },
                      { name: "status", label: "Status", type: "select", required: true, defaultValue: "CRITICAL", options: opts(ZONE_STATUSES) },
                    ]} />
                  </Disclosure>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
