import type { PlaybackSource } from "#srv/video-providers/types";
import type { PlayerSettings } from "#shared/lib/player-settings";

export interface DownloadChoice {
  id: string;
  kind: "original" | "rendition" | "single";
  height: number | null;
  sizeBytes: number | null;
}

export interface PremiumOffer {
  monthlyUsd: number;
  yearlyUsd: number;
  waitSec: number;
  speedLimit: boolean;
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
      viewer: { premium: boolean };
      player: PlayerSettings;
      intro: { start: number; end: number } | null;
      offer: PremiumOffer | null;
    };
