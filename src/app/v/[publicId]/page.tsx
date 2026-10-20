import type { Metadata } from "next";
import { WatchActions } from "@/components/watch/WatchActions";
import { APP_NAME } from "@/lib/brand";
import { formatDuration } from "@/lib/format";
import { embedUrlFor } from "@/server/videos/dto";
import { AdSlot, EmbedBody, loadEmbed } from "@/server/videos/embed-view";
import { getCoreEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ publicId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadEmbed((await params).publicId);
  return { title: data.title, robots: { index: false, follow: false } };
}

/** /v/:publicId — enlace directo para compartir: reproductor, descarga e inserción. */
export default async function WatchPage({ params }: Props) {
  const { publicId } = await params;
  const data = await loadEmbed(publicId);
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
        {data.state === "ready" && (
          <WatchActions
            title={data.title}
            watchUrl={`${getCoreEnv().APP_URL}/v/${publicId}`}
            embedUrl={embedUrlFor(publicId)}
            downloads={data.downloads}
          />
        )}
      </main>
      <AdSlot data={data} />
    </div>
  );
}
