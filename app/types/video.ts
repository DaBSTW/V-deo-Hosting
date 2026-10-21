import type { PlaybackSource } from "#srv/video-providers/types";

export interface DownloadChoice {
  kind: "original" | "rendition" | "single";
  height: number | null;
  sizeBytes: number | null;
  path: string;
}

export type PublicPlayback =
  | { state: "not_found" }
  | { state: "processing" | "error"; title: string; watchUrl: string; embedUrl: string }
  | {
      state: "ready";
      publicId: string;
      title: string;
      durationSec: number | null;
      source: PlaybackSource;
      downloads: DownloadChoice[];
      viewUrl: string;
      monetization: { qualifyAfterSec: number; adSnippet?: string } | null;
      watchUrl: string;
      embedUrl: string;
    };
