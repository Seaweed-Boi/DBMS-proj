"use client";

import { useEffect, type ReactNode } from "react";

export default function Modal({ title, onClose, children, width = "max-w-lg" }: {
  title: ReactNode; onClose: () => void; children: ReactNode; width?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-[10vh] text-left" onClick={onClose}>
      <div className={`w-full ${width} rounded-lg bg-white shadow-xl`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-xl leading-none text-slate-400 hover:text-slate-700" aria-label="Close">×</button>
        </div>
        <div className="whitespace-normal p-4">{children}</div>
      </div>
    </div>
  );
}
