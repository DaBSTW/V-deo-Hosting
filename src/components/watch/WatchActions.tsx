"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatBytes } from "@/lib/format";
import { CheckIcon, ChevronDownIcon, CodeIcon, DownloadIcon, LinkIcon } from "../ui/icons";

export interface DownloadChoice {
  label: string;
  sizeBytes: number | null;
  path: string;
}

type Size = "responsive" | "640x360" | "854x480" | "1280x720";
const SIZES: { id: Size; label: string }[] = [
  { id: "responsive", label: "Adaptable" },
  { id: "640x360", label: "640 × 360" },
  { id: "854x480", label: "854 × 480" },
  { id: "1280x720", label: "1280 × 720" },
];

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
  const [embedOpen, setEmbedOpen] = useState(false);
  const [size, setSize] = useState<Size>("responsive");
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);
  const code = useMemo(() => buildIframe(embedUrl, title, size), [embedUrl, title, size]);

  async function copy(text: string, what: "link" | "embed") {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copia el texto:", text);
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
          <CodeIcon /> Insertar
        </button>
        <button onClick={() => copy(watchUrl, "link")} className={`${btn} bg-white/10 text-zinc-100 hover:bg-white/15`}>
          {copied === "link" ? <CheckIcon /> : <LinkIcon />} {copied === "link" ? "¡Copiado!" : "Copiar enlace"}
        </button>
      </div>

      {embedOpen && (
        <div className="mt-3 rounded-2xl bg-zinc-900 p-4 ring-1 ring-white/10">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium">Inserta este video en tu web</p>
            <div className="flex flex-wrap gap-1 rounded-xl bg-black/40 p-1">
              {SIZES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSize(s.id)}
                  aria-pressed={size === s.id}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    size === s.id ? "bg-white text-zinc-900" : "text-zinc-400 hover:text-zinc-100"
                  }`}
                >
                  {s.label}
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
            <p className="text-xs text-zinc-500">Pega el código en el HTML de tu página, blog o CMS.</p>
            <button onClick={() => copy(code, "embed")} className={`${btn} shrink-0 bg-brand-600 text-white hover:bg-brand-700`}>
              {copied === "embed" ? <CheckIcon /> : <CodeIcon />} {copied === "embed" ? "¡Copiado!" : "Copiar código"}
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
        <DownloadIcon /> Descargar
        {o.sizeBytes ? <span className="text-xs font-normal text-white/70">{formatBytes(o.sizeBytes)}</span> : null}
      </a>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu" className={primary}>
        <DownloadIcon /> Descargar <ChevronDownIcon className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 z-20 mt-2 w-64 overflow-hidden rounded-xl bg-zinc-900 p-1 shadow-2xl ring-1 ring-white/10">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Elige la calidad</p>
          {options.map((o) => (
            <a
              key={o.path}
              role="menuitem"
              href={o.path}
              rel="nofollow"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-100 transition hover:bg-white/10"
            >
              <span className="font-medium">{o.label}</span>
              <span className="text-xs tabular-nums text-zinc-500">{o.sizeBytes ? formatBytes(o.sizeBytes) : ""}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
