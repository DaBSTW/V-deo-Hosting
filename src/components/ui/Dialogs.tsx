"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "./Modal";

export type DialogState =
  | null
  | {
      kind: "prompt";
      title: string;
      label: string;
      initial?: string;
      confirmLabel: string;
      maxLength?: number;
      onSubmit: (value: string) => Promise<boolean> | boolean;
    }
  | {
      kind: "confirm";
      title: string;
      message: string;
      confirmLabel: string;
      danger?: boolean;
      onConfirm: () => Promise<void> | void;
    };

/** Diálogos de confirmación / entrada de texto con el estilo de la app. */
export function Dialogs({ state, onClose }: { state: DialogState; onClose: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state?.kind === "prompt") setValue(state.initial ?? "");
    setBusy(false);
  }, [state]);

  if (!state) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!state) return;
    setBusy(true);
    try {
      if (state.kind === "prompt") {
        if (!value.trim()) return setBusy(false);
        if (await state.onSubmit(value.trim())) onClose();
        else setBusy(false);
      } else {
        await state.onConfirm();
        onClose();
      }
    } catch {
      setBusy(false);
    }
  }

  const btn = "rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-60";
  return (
    <Modal open onClose={onClose} title={state.title} size="sm">
      <form onSubmit={submit} className="space-y-5 p-5">
        {state.kind === "prompt" ? (
          <label className="block text-sm font-medium text-zinc-700">
            {state.label}
            <input
              autoFocus
              value={value}
              maxLength={state.maxLength ?? 200}
              onChange={(e) => setValue(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="mt-1.5 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>
        ) : (
          <p className="text-sm leading-relaxed text-zinc-600">{state.message}</p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={`${btn} text-zinc-600 hover:bg-zinc-100`}>
            Cancelar
          </button>
          <button
            autoFocus={state.kind === "confirm"}
            disabled={busy}
            className={`${btn} text-white ${
              state.kind === "confirm" && state.danger ? "bg-red-600 hover:bg-red-700" : "bg-brand-600 hover:bg-brand-700"
            }`}
          >
            {busy ? "Un momento…" : state.confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
