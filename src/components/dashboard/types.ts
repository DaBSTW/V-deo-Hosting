import type { PublicVideo } from "@/server/videos/dto";
import type { PublicFolder } from "@/server/videos/service";

export type { PublicVideo, PublicFolder };

/** Vista actual de la biblioteca: todos, sin carpeta o una carpeta concreta. */
export type FolderFilter = { kind: "all" } | { kind: "none" } | { kind: "folder"; id: string };

export interface VideoActions {
  open: (v: PublicVideo) => void;
  copyIframe: (v: PublicVideo) => void;
  copyLink: (v: PublicVideo) => void;
  rename: (v: PublicVideo) => void;
  move: (ids: string[], folderId: string | null) => void;
  remove: (v: PublicVideo) => void;
}

/** Tipo MIME propio para arrastrar videos hacia carpetas. */
export const DRAG_MIME = "application/x-vidhost-videos";
