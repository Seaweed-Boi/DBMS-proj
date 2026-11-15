import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import Nav from "@/components/Nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <div className="min-h-screen">
      <Nav name={user.name ?? user.email ?? "User"} role={user.role} />
      <main className="px-4 py-6 md:ml-60 md:px-8">{children}</main>
    </div>
  );
}
