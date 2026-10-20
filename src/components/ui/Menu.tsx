"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Muestra una marca de selección (p. ej. carpeta actual). */
  checked?: boolean;
}

export type MenuEntry = MenuItem | "separator" | { heading: string };

/** Menú desplegable accesible y sin dependencias (cierra con clic fuera / Escape). */
export function Menu({
  trigger,
  items,
  align = "right",
  label,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  items: MenuEntry[];
  align?: "left" | "right";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={`absolute z-30 mt-1.5 max-h-80 w-56 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-xl shadow-zinc-900/10 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {items.map((item, i) => {
            if (item === "separator") return <div key={i} className="my-1 h-px bg-zinc-100" />;
            if ("heading" in item) {
              return (
                <p key={i} className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  {item.heading}
                </p>
              );
            }
            return (
              <button
                key={i}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition disabled:opacity-40 ${
                  item.danger ? "text-red-600 hover:bg-red-50" : "text-zinc-700 hover:bg-zinc-100"
                }`}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center text-zinc-400">{item.icon}</span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.checked && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
