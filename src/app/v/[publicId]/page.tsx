import type { Metadata } from "next";
import { APP_NAME } from "@/lib/brand";
import { formatDuration } from "@/lib/format";
import { EmbedBody, loadEmbed } from "@/server/videos/embed-view";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ publicId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadEmbed((await params).publicId);
  return { title: data.title, robots: { index: false, follow: false } };
}

/** /v/:publicId — enlace directo para compartir (página con el reproductor). */
export default async function WatchPage({ params }: Props) {
  const data = await loadEmbed((await params).publicId);
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="mx-auto max-w-5xl px-4 py-4 text-sm font-semibold tracking-tight text-zinc-400 sm:px-6">
        {APP_NAME}
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-12 sm:px-6">
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-black shadow-2xl ring-1 ring-white/10">
          <EmbedBody data={data} />
        </div>
        <h1 className="mt-4 text-lg font-semibold">{data.title}</h1>
        {data.state === "ready" && data.durationSec ? (
          <p className="mt-1 text-sm text-zinc-500">{formatDuration(data.durationSec)}</p>
        ) : null}
      </main>
    </div>
  );
}
