import type { Metadata } from "next";
import { AdSlot, EmbedBody, loadEmbed } from "@/server/videos/embed-view";

// Siempre dinámico: las URLs de reproducción firmadas caducan.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ autoplay?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadEmbed((await params).publicId);
  return { title: data.title, robots: { index: false, follow: false } };
}

/** /embed/:publicId — reproductor a pantalla completa pensado para iframes. */
export default async function EmbedPage({ params, searchParams }: Props) {
  const data = await loadEmbed((await params).publicId);
  const { autoplay } = await searchParams;
  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <EmbedBody data={data} autoPlay={autoplay === "1"} />
      <AdSlot data={data} />
    </div>
  );
}
