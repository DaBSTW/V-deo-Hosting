import type { MenuEntry } from "../ui/Menu";
import { CodeIcon, ExternalIcon, FolderIcon, InboxIcon, LinkIcon, PencilIcon, TrashIcon } from "../ui/icons";
import type { PublicFolder, PublicVideo, VideoActions } from "./types";

/** Entradas del menú contextual de un video (compartido por cuadrícula, lista y modal). */
export function videoMenuItems(v: PublicVideo, actions: VideoActions, folders: PublicFolder[]): MenuEntry[] {
  const ready = v.status === "ready";
  return [
    { label: "Copiar código iFrame", icon: <CodeIcon />, onSelect: () => actions.copyIframe(v), disabled: !ready },
    { label: "Copiar enlace directo", icon: <LinkIcon />, onSelect: () => actions.copyLink(v), disabled: !ready },
    {
      label: "Abrir en pestaña nueva",
      icon: <ExternalIcon />,
      onSelect: () => window.open(v.watchUrl, "_blank", "noopener"),
      disabled: !ready,
    },
    "separator",
    { label: "Renombrar", icon: <PencilIcon />, onSelect: () => actions.rename(v) },
    { heading: "Mover a" },
    { label: "Sin carpeta", icon: <InboxIcon />, onSelect: () => actions.move([v.id], null), checked: v.folderId === null },
    ...folders.map<MenuEntry>((f) => ({
      label: f.name,
      icon: <FolderIcon />,
      onSelect: () => actions.move([v.id], f.id),
      checked: v.folderId === f.id,
    })),
    "separator",
    { label: "Eliminar", icon: <TrashIcon />, onSelect: () => actions.remove(v), danger: true },
  ];
}
