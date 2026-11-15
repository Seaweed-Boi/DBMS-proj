import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listCentres, listUsersByRole } from "@/lib/queries";
import { can } from "@/lib/constants";
import { Badge, Card, PageHeader, Progress, Table, Td } from "@/components/ui";
import ApiForm from "@/components/ApiForm";
import ApiButton from "@/components/ApiButton";
import Disclosure from "@/components/Disclosure";
import { num } from "@/lib/format";

export default async function CentresPage() {
  const user = (await getCurrentUser())!;
  const [centres, managers] = await Promise.all([listCentres(), listUsersByRole(["CENTRE_MANAGER", "ADMIN"])]);
  const isAdmin = can(user.role, "manageCentres");
  const mayEdit = (managerId: number) => isAdmin || (user.role === "CENTRE_MANAGER" && managerId === user.id);

  return (
    <>
      <PageHeader title="Relief Centres" subtitle="Shelter capacity, occupancy, operational status and stock held at each hub." />

      {isAdmin && (
        <Card title="Add relief centre" className="mb-6">
          <ApiForm endpoint="/api/centres" columns={4} submitLabel="Create centre" fields={[
            { name: "centre_name", label: "Centre name", required: true, span: 2 },
            { name: "district", label: "District", required: true },
            { name: "manager_id", label: "Manager", type: "select", required: true,
              options: managers.map((m) => ({ value: m.user_id, label: `${m.full_name} (${m.role === "ADMIN" ? "Admin" : "Manager"})` })) },
            { name: "address", label: "Address", required: true, span: 2 },
            { name: "total_capacity", label: "Total capacity", type: "number", min: 1, required: true },
            { name: "contact_phone", label: "Contact phone", required: true },
          ]} />
        </Card>
      )}

      <Card bodyClass="">
        <Table head={["Centre", "Manager", "Occupancy", "Load", "Stock (avail / reserved)", "Low-stock", "Volunteers", "Status", ""]} empty={centres.length === 0}>
          {centres.map((c) => (
            <tr key={c.centre_id} className={c.is_active ? "" : "opacity-60"}>
              <Td>
                <div className="font-medium">{c.centre_name}</div>
                <div className="text-xs text-slate-400">{c.address} · {c.district} · {c.contact_phone}</div>
              </Td>
              <Td>{c.manager_name}</Td>
              <Td className="tabular-nums">{num(c.current_occupancy)} / {num(c.total_capacity)}</Td>
              <Td><Progress value={c.current_occupancy} max={c.total_capacity} /></Td>
              <Td className="tabular-nums">
                <Link className="hover:underline" href={`/inventory?centre_id=${c.centre_id}`}>{num(c.units_available)} / {num(c.units_reserved)}</Link>
              </Td>
              <Td>{c.low_stock_batches > 0 ? <Badge tone="amber">{c.low_stock_batches} batches</Badge> : <span className="text-slate-400">—</span>}</Td>
              <Td className="tabular-nums">{c.volunteers}</Td>
              <Td>{c.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Inactive</Badge>}</Td>
              <Td>{mayEdit(c.manager_id) && (
                <div className="flex items-start justify-end gap-2">
                  <Disclosure label="Update" align="right">
                    <ApiForm endpoint={`/api/centres/${c.centre_id}`} method="PATCH" onDoneReset={false} compact columns={2} fields={[
                      { name: "current_occupancy", label: `Occupancy (max ${c.total_capacity})`, type: "number", min: 0, max: c.total_capacity, required: true, defaultValue: c.current_occupancy },
                      { name: "contact_phone", label: "Contact phone", required: true, defaultValue: c.contact_phone },
                      ...(isAdmin ? [
                        { name: "total_capacity", label: "Total capacity", type: "number" as const, min: 1, required: true, defaultValue: c.total_capacity },
                        { name: "manager_id", label: "Manager", type: "select" as const, required: true, defaultValue: c.manager_id,
                          options: managers.map((m) => ({ value: m.user_id, label: m.full_name })) },
                      ] : []),
                    ]} />
                  </Disclosure>
                  <ApiButton endpoint={`/api/centres/${c.centre_id}`} body={{ is_active: !c.is_active }} variant={c.is_active ? "danger" : "success"}>
                    {c.is_active ? "Deactivate" : "Activate"}
                  </ApiButton>
                </div>
              )}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
