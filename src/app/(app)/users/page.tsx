import { getCurrentUser } from "@/lib/auth";
import { listUsers } from "@/lib/queries";
import { ROLE_LABELS, ROLES, SKILLS } from "@/lib/constants";
import { Badge, Card, PageHeader, Table, Td } from "@/components/ui";
import ApiForm from "@/components/ApiForm";
import ApiButton from "@/components/ApiButton";
import { date, label } from "@/lib/format";

export default async function UsersPage() {
  const me = (await getCurrentUser())!;
  const users = await listUsers();
  return (
    <>
      <PageHeader title="Users & Roles" subtitle="Role-based access: System Admin, Centre Manager, Field Coordinator, Volunteer." />
      <Card title="Create account" className="mb-6">
        <ApiForm endpoint="/api/users" columns={3} submitLabel="Create user" successMessage="User created" fields={[
          { name: "full_name", label: "Full name", required: true },
          { name: "email", label: "Email", type: "email", required: true },
          { name: "password", label: "Initial password (min 8)", type: "password", required: true },
          { name: "phone", label: "Phone" },
          { name: "role", label: "Role", type: "select", required: true, options: ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })) },
          { name: "primary_skill", label: "Primary skill (volunteers)", type: "select", options: SKILLS.map((s) => ({ value: s, label: label(s) })) },
        ]} />
      </Card>
      <Card bodyClass="">
        <Table head={["User", "Role", "Phone", "Centres managed", "Requests submitted", "Joined", ""]}>
          {users.map((u) => (
            <tr key={u.user_id}>
              <Td><div className="font-medium">{u.full_name}</div><div className="text-xs text-slate-400">{u.email}</div></Td>
              <Td><Badge value={u.role}>{ROLE_LABELS[u.role as keyof typeof ROLE_LABELS]}</Badge></Td>
              <Td>{u.phone ?? "—"}</Td>
              <Td className="tabular-nums">{u.centres_managed}</Td>
              <Td className="tabular-nums">{u.requests_submitted}</Td>
              <Td className="text-xs">{date(u.created_at)}</Td>
              <Td>{u.user_id !== me.id && (
                <ApiButton endpoint={`/api/users/${u.user_id}`} method="DELETE" variant="danger"
                  confirm={`Delete ${u.full_name}? Fails if they manage centres or have logged requests/allocations.`}>Delete</ApiButton>
              )}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
