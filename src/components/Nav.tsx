"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import type { Role } from "@/lib/constants";
import { ROLE_LABELS } from "@/lib/constants";
import AlertFeed from "./AlertFeed";

const LINKS: { href: string; label: string; roles?: Role[] }[] = [
  { href: "/", label: "Command Dashboard" },
  { href: "/disasters", label: "Disasters & Zones" },
  { href: "/centres", label: "Relief Centres" },
  { href: "/inventory", label: "Inventory & Expiry" },
  { href: "/requests", label: "Request Console" },
  { href: "/allocations", label: "Dispatch Tracker" },
  { href: "/volunteers", label: "Volunteer Roster" },
  { href: "/catalog", label: "Resource Catalog" },
  { href: "/reports", label: "Reports", roles: ["ADMIN", "CENTRE_MANAGER", "COORDINATOR"] },
  { href: "/users", label: "Users", roles: ["ADMIN"] },
];

export default function Nav({ name, role }: { name: string; role: Role }) {
  const path = usePathname();
  return (
    <aside className="flex w-full flex-col bg-slate-900 text-slate-300 md:fixed md:inset-y-0 md:w-60">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 font-bold text-white">+</div>
        <div>
          <div className="text-sm font-semibold text-white">DRRMS</div>
          <div className="text-[11px] text-slate-400">Relief Operations</div>
        </div>
      </div>
      <nav className="flex flex-row flex-wrap gap-1 px-3 md:flex-1 md:flex-col md:flex-nowrap">
        {LINKS.filter((l) => !l.roles || l.roles.includes(role)).map((l) => {
          const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href}
              className={`rounded-md px-3 py-2 text-sm ${active ? "bg-slate-800 font-medium text-white" : "hover:bg-slate-800/60 hover:text-white"}`}>
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-800 px-5 py-4">
        <AlertFeed />
        <div className="mt-3 text-sm font-medium text-white">{name}</div>
        <div className="text-xs text-slate-400">{ROLE_LABELS[role]}</div>
        <button onClick={() => signOut({ callbackUrl: "/login" })} className="mt-3 text-xs text-slate-400 hover:text-white">
          Sign out →
        </button>
      </div>
    </aside>
  );
}
