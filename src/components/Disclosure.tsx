"use client";

import { useState, type ReactNode } from "react";
import Modal from "./Modal";

/** Button that opens its children (usually an inline form) in a modal dialog. */
export default function Disclosure({ label, title, children, align = "left" }: {
  label: string; title?: ReactNode; children: ReactNode; align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <button type="button" onClick={() => setOpen(true)}
        className="rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
        {label}
      </button>
      {open && <Modal title={title ?? label} onClose={() => setOpen(false)}>{children}</Modal>}
    </div>
  );
}
