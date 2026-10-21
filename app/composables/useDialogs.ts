/**
 * Diálogos globales de confirmación y de entrada de texto, con el estilo de
 * la app. Uso: `confirm({ title, message, confirmLabel, danger, onConfirm })`.
 * Se pintan en <UiDialogHost /> (una vez por página).
 */
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

export function useDialogs() {
  const state = useState<DialogState>("dialog", () => null);
  return {
    state,
    confirm: (d: Omit<Extract<DialogState, { kind: "confirm" }>, "kind">) => (state.value = { kind: "confirm", ...d }),
    prompt: (d: Omit<Extract<DialogState, { kind: "prompt" }>, "kind">) => (state.value = { kind: "prompt", ...d }),
    close: () => (state.value = null),
  };
}
