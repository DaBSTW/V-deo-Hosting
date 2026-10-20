"use client";

import { useTranslations } from "next-intl";
import type { PublicVideoStatus } from "@/server/videos/dto";

const STYLES: Record<PublicVideoStatus, { cls: string; dot: string }> = {
  uploading: { cls: "bg-zinc-100 text-zinc-700", dot: "bg-zinc-400 animate-pulse" },
  processing: { cls: "bg-amber-50 text-amber-700", dot: "bg-amber-500 animate-pulse" },
  ready: { cls: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  error: { cls: "bg-red-50 text-red-700", dot: "bg-red-500" },
};

export function StatusBadge({ status }: { status: PublicVideoStatus }) {
  const t = useTranslations("status");
  const s = STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {t(status)}
    </span>
  );
}
