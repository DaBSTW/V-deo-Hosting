"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useFormat } from "@/i18n/useFormat";
import { CheckIcon, ChevronDownIcon, CodeIcon, DownloadIcon, LinkIcon } from "../ui/icons";

export interface DownloadChoice {
  kind: "original" | "rendition" | "single";
  height: number | null;
  sizeBytes: number | null;
  path: string;
}

type Size = "responsive" | "640x360" | "854x480" | "1280x720";
const SIZES: Size[] = ["responsive", "640x360", "854x480", "1280x720"];

const ALLOW = "autoplay; fullscreen; picture-in-picture; encrypted-media";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Código de inserción según el tamaño elegido. */
function buildIframe(embedUrl: string, title: string, size: Size): string {
  const t = esc(title);
  if (size === "responsive") {
    return (
      `<div style="position:relative;width:100%;padding-top:56.25%">` +
      `<iframe src="${embedUrl}" title="${t}" style="position:absolute;inset:0;width:100%;height:100%;border:0" ` +
      `allow="${ALLOW}" allowfullscreen loading="lazy"></iframe></div>`
    );
  }
  const [w, h] = size.split("x");
  return `<iframe src="${embedUrl}" title="${t}" width="${w}" height="${h}" style="border:0" allow="${ALLOW}" allowfullscreen loading="lazy"></iframe>`;
}

const btn =
  "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";

/** Acciones de la página pública: descargar (con calidad), insertar y copiar enlace. */
export function WatchActions({
  title,
  watchUrl,
  embedUrl,
  downloads,
}: {
  title: string;
  watchUrl: string;
  embedUrl: string;
  downloads: DownloadChoice[];
}) {
  const t = useTranslations("watch");
  const [embedOpen, setEmbedOpen] = useState(false);
  const [size, setSize] = useState<Size>("responsive");
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);
  const code = useMemo(() => buildIframe(embedUrl, title, size), [embedUrl, title, size]);

  async function copy(text: string, what: "link" | "embed") {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt(t("copyPrompt"), text);
    }
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        {downloads.length > 0 && <DownloadButton options={downloads} />}
        <button
          onClick={() => setEmbedOpen((o) => !o)}
          aria-expanded={embedOpen}
          className={`${btn} ${embedOpen ? "bg-white text-zinc-900" : "bg-white/10 text-zinc-100 hover:bg-white/15"}`}
        >
          <CodeIcon /> {t("embed")}
        </button>
        <button onClick={() => copy(watchUrl, "link")} className={`${btn} bg-white/10 text-zinc-100 hover:bg-white/15`}>
          {copied === "link" ? <CheckIcon /> : <LinkIcon />} {copied === "link" ? t("copied") : t("copyLink")}
        </button>
      </div>

      {embedOpen && (
        <div className="mt-3 rounded-2xl bg-zinc-900 p-4 ring-1 ring-white/10">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium">{t("embedTitle")}</p>
            <div className="flex flex-wrap gap-1 rounded-xl bg-black/40 p-1">
              {SIZES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  aria-pressed={size === s}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    size === s ? "bg-white text-zinc-900" : "text-zinc-400 hover:text-zinc-100"
                  }`}
                >
                  {s === "responsive" ? t("responsive") : s.replace("x", " × ")}
                </button>
              ))}
            </div>
          </div>
          <textarea
            readOnly
            value={code}
            rows={3}
            onFocus={(e) => e.target.select()}
            className="block w-full resize-none rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 font-mono text-xs leading-relaxed text-zinc-300 outline-none focus:border-brand-500"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-zinc-500">{t("embedHint")}</p>
            <button onClick={() => copy(code, "embed")} className={`${btn} shrink-0 bg-brand-600 text-white hover:bg-brand-700`}>
              {copied === "embed" ? <CheckIcon /> : <CodeIcon />} {copied === "embed" ? t("copied") : t("copyCode")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Una sola calidad → enlace directo. Varias → menú para elegir.
 * Los enlaces apuntan a nuestra pasarela `/media/...`, que redirige a la
 * descarga directa del proveedor (el archivo no pasa por el VPS).
 */
function DownloadButton({ options }: { options: DownloadChoice[] }) {
  const t = useTranslations("watch");
  const { formatBytes } = useFormat();
  const labelOf = (o: DownloadChoice) =>
    o.kind === "original" ? (o.height ? t("originalHeight", { height: o.height }) : t("original")) : o.kind === "single" ? "MP4" : `${o.height}p`;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const primary = `${btn} bg-brand-600 text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700`;

  if (options.length === 1) {
    const o = options[0];
    return (
      <a href={o.path} className={primary} rel="nofollow">
        <DownloadIcon /> {t("download")}
        {o.sizeBytes ? <span className="text-xs font-normal text-white/70">{formatBytes(o.sizeBytes)}</span> : null}
      </a>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu" className={primary}>
        <DownloadIcon /> {t("download")} <ChevronDownIcon className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 z-20 mt-2 w-64 overflow-hidden rounded-xl bg-zinc-900 p-1 shadow-2xl ring-1 ring-white/10">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{t("chooseQuality")}</p>
          {options.map((o) => (
            <a
              key={o.path}
              role="menuitem"
              href={o.path}
              rel="nofollow"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-100 transition hover:bg-white/10"
            >
              <span className="font-medium">{labelOf(o)}</span>
              <span className="text-xs tabular-nums text-zinc-500">{o.sizeBytes ? formatBytes(o.sizeBytes) : ""}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
