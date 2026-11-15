import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-red-600 text-xl font-bold text-white">+</div>
          <h1 className="text-2xl font-semibold text-white">DRRMS</h1>
          <p className="mt-1 text-sm text-slate-400">Disaster Relief Resource Management System</p>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-xl">
          <Suspense><LoginForm /></Suspense>
        </div>
        <div className="mt-6 rounded-lg border border-slate-700 p-4 text-xs text-slate-400">
          <div className="mb-2 font-semibold text-slate-300">Demo accounts (password <code>relief@123</code>)</div>
          <ul className="grid grid-cols-2 gap-1 font-mono">
            <li>admin@drrms.org</li><li className="text-slate-500">System Admin</li>
            <li>vikram@drrms.org</li><li className="text-slate-500">Centre Manager</li>
            <li>rahul@drrms.org</li><li className="text-slate-500">Field Coordinator</li>
            <li>arjun@drrms.org</li><li className="text-slate-500">Volunteer</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
