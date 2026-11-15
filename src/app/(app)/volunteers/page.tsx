import { getCurrentUser } from "@/lib/auth";
import { listCentres, listVolunteers, listZones } from "@/lib/queries";
import { AVAILABILITY, can, SKILLS } from "@/lib/constants";
import { Badge, Card, FilterLinks, PageHeader, Stat, Table, Td } from "@/components/ui";
import ApiForm from "@/components/ApiForm";
import ApiButton from "@/components/ApiButton";
import Disclosure from "@/components/Disclosure";
import { label } from "@/lib/format";

export default async function VolunteersPage({ searchParams }: { searchParams: Promise<{ skill?: string; availability?: string }> }) {
  const sp = await searchParams;
  const user = (await getCurrentUser())!;
  const skill = sp.skill && (SKILLS as readonly string[]).includes(sp.skill) ? sp.skill : undefined;
  const [all, centres, zones] = await Promise.all([listVolunteers(), listCentres(), listZones()]);
  const rows = all.filter((v) => (!skill || v.primary_skill === skill) && (!sp.availability || v.availability_status === sp.availability));
  const assigner = can(user.role, "assignVolunteers");
  const me = all.find((v) => v.volunteer_id === user.id);

  return (
    <>
      <PageHeader title="Volunteer Deployment Roster" subtitle="Match available personnel by verified skill to active relief centres and affected zones." />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {SKILLS.map((s) => {
          const avail = all.filter((v) => v.primary_skill === s && v.availability_status === "AVAILABLE").length;
          const total = all.filter((v) => v.primary_skill === s).length;
          return <Stat key={s} label={label(s)} value={avail} hint={`available of ${total}`} tone={avail ? "green" : "slate"} href={`/volunteers?skill=${s}`} />;
        })}
      </div>

      {me && (
        <Card title="My availability" className="mb-6">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge value={me.availability_status} />
            {me.centre_name && <span>Stationed at <b>{me.centre_name}</b></span>}
            {me.zone_name && <span>Deployed to <b>{me.zone_name}</b></span>}
            <span className="ml-auto flex gap-2">
              {me.availability_status !== "ON_LEAVE" && <ApiButton endpoint={`/api/volunteers/${me.volunteer_id}`} body={{ availability_status: "ON_LEAVE" }}>Go on leave</ApiButton>}
              {me.availability_status === "ON_LEAVE" && <ApiButton endpoint={`/api/volunteers/${me.volunteer_id}`} body={{ availability_status: "AVAILABLE" }} variant="success">Mark available</ApiButton>}
            </span>
          </div>
        </Card>
      )}

      <Card bodyClass="" title="Roster" actions={
        <div className="flex flex-wrap gap-3">
          <FilterLinks base="/volunteers" param="skill" current={skill} options={[{ label: "All skills" }, ...SKILLS.map((s) => ({ value: s, label: label(s) }))]} />
          <FilterLinks base="/volunteers" param="availability" current={sp.availability} options={AVAILABILITY.map((s) => ({ value: s, label: label(s) }))} />
        </div>
      }>
        <Table head={["Volunteer", "Skill", "Status", "Centre", "Zone", ""]} empty={rows.length === 0}>
          {rows.map((v) => (
            <tr key={v.volunteer_id}>
              <Td><div className="font-medium">{v.full_name}</div><div className="text-xs text-slate-400">{v.email} · {v.phone ?? "no phone"}</div></Td>
              <Td><Badge tone="slate" value={v.primary_skill} /></Td>
              <Td><Badge value={v.availability_status} /></Td>
              <Td>{v.centre_name ?? <span className="text-slate-400">—</span>}</Td>
              <Td>{v.zone_name ?? <span className="text-slate-400">—</span>}</Td>
              <Td>{assigner && (
                <div className="flex items-start justify-end gap-2">
                  <Disclosure label={v.availability_status === "DEPLOYED" ? "Reassign" : "Assign"} align="right">
                    <ApiForm endpoint={`/api/volunteers/${v.volunteer_id}`} method="PATCH" compact columns={2} onDoneReset={false} fields={[
                      { name: "assigned_centre_id", label: "Relief centre", type: "select", defaultValue: v.assigned_centre_id,
                        options: centres.filter((c) => c.is_active).map((c) => ({ value: c.centre_id, label: c.centre_name })) },
                      { name: "assigned_zone_id", label: "Affected zone", type: "select", defaultValue: v.assigned_zone_id,
                        options: zones.filter((z) => z.status !== "CLEARED").map((z) => ({ value: z.zone_id, label: `${z.zone_name} (${z.district})` })) },
                    ]} />
                  </Disclosure>
                  {v.availability_status === "DEPLOYED" && (
                    <ApiButton endpoint={`/api/volunteers/${v.volunteer_id}`} body={{ availability_status: "AVAILABLE" }}>Release</ApiButton>
                  )}
                </div>
              )}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
