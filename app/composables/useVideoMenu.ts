import { Code, ExternalLink, Folder, Inbox, Link, Pencil, Trash2 } from "lucide-vue-next";
import type { MenuEntry } from "~/types/ui";
import type { PublicVideo } from "~/composables/useDashboard";

/** Entradas del menú contextual de un video (cuadrícula, lista y modal). */
export function useVideoMenu() {
  const { t } = useI18n();
  const d = useDashboard();
  return (v: PublicVideo): MenuEntry[] => {
    const ready = v.status === "ready";
    return [
      { label: t("video.copyIframe"), icon: Code, onSelect: () => d.actions.copyIframe(v), disabled: !ready },
      { label: t("video.copyLink"), icon: Link, onSelect: () => d.actions.copyLink(v), disabled: !ready },
      { label: t("video.openNewTab"), icon: ExternalLink, onSelect: () => window.open(v.watchUrl, "_blank", "noopener"), disabled: !ready },
      "separator",
      { label: t("video.rename"), icon: Pencil, onSelect: () => d.actions.rename(v) },
      { heading: t("video.moveTo") },
      { label: t("video.noFolder"), icon: Inbox, onSelect: () => d.actions.move([v.id], null), checked: v.folderId === null },
      ...d.folders.value.map<MenuEntry>((f) => ({ label: f.name, icon: Folder, onSelect: () => d.actions.move([v.id], f.id), checked: v.folderId === f.id })),
      "separator",
      { label: t("video.delete"), icon: Trash2, onSelect: () => d.actions.remove(v), danger: true },
    ];
  };
}
