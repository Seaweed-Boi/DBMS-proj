import { getCurrentUser } from "@/lib/auth";
import { listCategories, listItems } from "@/lib/queries";
import { can } from "@/lib/constants";
import { Badge, Card, PageHeader, Table, Td } from "@/components/ui";
import ApiForm from "@/components/ApiForm";
import { num } from "@/lib/format";

export default async function CatalogPage() {
  const user = (await getCurrentUser())!;
  const [categories, items] = await Promise.all([listCategories(), listItems()]);
  const admin = can(user.role, "manageCatalog");

  return (
    <>
      <PageHeader title="Resource Catalog" subtitle="Categories own the unit of measure and perishability (3NF); items belong to exactly one category." />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Categories" bodyClass="">
          <Table head={["Category", "Unit", "Perishable", "Items"]} empty={categories.length === 0}>
            {categories.map((c) => (
              <tr key={c.category_id}>
                <Td className="font-medium">{c.category_name}</Td><Td>{c.unit_of_measure}</Td>
                <Td>{c.is_perishable ? <Badge tone="amber">Yes — expiry tracked</Badge> : <Badge tone="slate">No</Badge>}</Td>
                <Td className="tabular-nums">{c.item_count}</Td>
              </tr>
            ))}
          </Table>
          {admin && (
            <div className="border-t border-slate-100 p-4">
              <ApiForm endpoint="/api/categories" compact submitLabel="Add category" fields={[
                { name: "category_name", label: "Name", required: true },
                { name: "unit_of_measure", label: "Unit", required: true, placeholder: "Boxes, Kits…" },
                { name: "is_perishable", label: "Perishable", type: "checkbox" },
              ]} />
            </div>
          )}
        </Card>
        <Card title="Items" className="xl:col-span-2" bodyClass="">
          <Table head={["SKU", "Item", "Category", "Available (all centres)", "Reserved"]} empty={items.length === 0}>
            {items.map((i) => (
              <tr key={i.item_id}>
                <Td className="font-mono text-xs">{i.sku}</Td>
                <Td><div className="font-medium">{i.item_name}</div>{i.description && <div className="text-xs text-slate-400">{i.description}</div>}</Td>
                <Td>{i.category_name}</Td>
                <Td className="tabular-nums">{num(i.total_available)} <span className="text-xs text-slate-400">{i.unit_of_measure}</span></Td>
                <Td className="tabular-nums">{num(i.total_reserved)}</Td>
              </tr>
            ))}
          </Table>
          {admin && (
            <div className="border-t border-slate-100 p-4">
              <ApiForm endpoint="/api/items" compact columns={4} submitLabel="Add item" fields={[
                { name: "item_name", label: "Item name", required: true },
                { name: "sku", label: "SKU", required: true, placeholder: "FW-XXXX" },
                { name: "category_id", label: "Category", type: "select", required: true, options: categories.map((c) => ({ value: c.category_id, label: c.category_name })) },
                { name: "description", label: "Description" },
              ]} />
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
