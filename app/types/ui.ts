import type { Component } from "vue";

export interface MenuAction {
  label: string;
  icon?: Component;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Marca de selección (p. ej. carpeta actual). */
  checked?: boolean;
}
export type MenuEntry = MenuAction | "separator" | { heading: string };
