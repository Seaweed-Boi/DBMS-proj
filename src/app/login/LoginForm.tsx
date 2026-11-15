"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true); setError(null);
    const res = await signIn("credentials", {
      email: data.get("email"), password: data.get("password"), redirect: false,
    });
    setBusy(false);
    if (res?.error) { setError("Invalid email or password"); return; }
    router.replace(params.get("callbackUrl") ?? "/");
    router.refresh();
  }

  const input = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
        <input name="email" type="email" required autoComplete="username" defaultValue="admin@drrms.org" className={input} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
        <input name="password" type="password" required autoComplete="current-password" className={input} />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={busy} className="w-full rounded-md bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
