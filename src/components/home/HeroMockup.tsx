import { CheckIcon, CodeIcon, PlayIcon, UploadIcon } from "@/components/ui/icons";

type Labels = { uploading: string; ready: string; copyIframe: string; views: string; monetized: string };

// Barras decorativas del mini gráfico (forma, no datos reales).
const BARS = [38, 52, 44, 66, 58, 80, 92];

/**
 * Ilustración del producto hecha con HTML/CSS (sin imágenes ni capturas): una ventana
 * con el reproductor y tarjetas flotantes. Es puramente decorativa (aria-hidden).
 */
export function HeroMockup({ labels }: { labels: Labels }) {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-xl select-none lg:max-w-none">
      <div className="absolute -inset-6 rounded-[2rem] bg-brand-500/20 blur-3xl" />

      {/* Ventana del navegador */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl shadow-black/50">
        <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="ml-3 h-5 flex-1 rounded-md bg-white/5" />
        </div>
        <div className="p-4">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-gradient-to-br from-brand-700 via-zinc-800 to-zinc-950">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.18),transparent_55%)]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-zinc-900 shadow-lg">
                <PlayIcon className="ml-0.5 h-6 w-6" />
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-8">
              <div className="h-1 rounded-full bg-white/25">
                <div className="h-1 w-2/5 rounded-full bg-brand-400" />
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] font-medium text-white/70">
                <span>03:12 / 08:45</span>
                <span className="rounded bg-white/15 px-1.5 py-0.5">1080p</span>
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="aspect-video rounded-lg bg-white/5" />
                <div className="h-2 w-4/5 rounded bg-white/10" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tarjeta: subida en curso */}
      <div className="absolute -left-4 top-16 hidden w-52 rounded-xl border border-white/10 bg-zinc-900/95 p-3 shadow-xl backdrop-blur sm:block lg:-left-10">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-200">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-500/20 text-brand-300">
            <UploadIcon className="h-3.5 w-3.5" />
          </span>
          {labels.uploading}
        </div>
        <div className="mt-2.5 h-1.5 rounded-full bg-white/10">
          <div className="h-1.5 w-[68%] rounded-full bg-brand-500" />
        </div>
      </div>

      {/* Tarjeta: listo para insertar */}
      <div className="absolute -right-3 top-1/2 hidden rounded-xl border border-white/10 bg-zinc-900/95 p-3 shadow-xl backdrop-blur sm:block lg:-right-8">
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-300">
          <CheckIcon className="h-3.5 w-3.5" />
          {labels.ready}
        </div>
        <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white">
          <CodeIcon className="h-3.5 w-3.5" />
          {labels.copyIframe}
        </div>
      </div>

      {/* Tarjeta: mini gráfico de reproducciones */}
      <div className="absolute -bottom-6 left-6 hidden w-56 rounded-xl border border-white/10 bg-zinc-900/95 p-3 shadow-xl backdrop-blur sm:block">
        <div className="text-[11px] font-medium text-zinc-400">{labels.views}</div>
        <div className="mt-2 flex h-12 items-end gap-1.5">
          {BARS.map((h, i) => (
            <div key={i} className="flex-1 rounded-sm bg-brand-500/80" style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-zinc-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          {labels.monetized}
        </div>
      </div>
    </div>
  );
}
