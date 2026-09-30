import type { VisualMode } from "@/lib/types/visual";
import type { WordTimestamp } from "@/lib/types/voice";

export type TimelineAspectRatio = "16:9" | "9:16" | "1:1";

export type TimelineScene = {
  id: string;
  assetId: string;
  sceneIndex: number;
  title: string;
  url: string;
  mode: VisualMode;
  startSeconds: number;
  durationSeconds: number;
};

export type CaptionStyle = {
  fontFamily: string;
  fontSize: number;
  color: string;
  position: "bottom" | "center" | "top";
  highlightCurrentWord: boolean;
  backgroundColor: string;
};

export type BackgroundMusic = {
  source: "upload" | "bundled";
  url: string;
  name: string;
  volume: number;
};

export type TimelineQuickStyle =
  | "none"
  | "grayscale"
  | "high-contrast"
  | "warm"
  | "cool"
  | "vintage";

export type TimelineEffects = {
  brightness: number;
  contrast: number;
  gamma: number;
  quickStyle: TimelineQuickStyle;
};

export type TimelineJson = {
  version: 1;
  aspectRatio: TimelineAspectRatio;
  totalDurationSeconds: number;
  voiceTrack: {
    url: string;
    durationSeconds: number;
  } | null;
  captions: {
    words: WordTimestamp[];
    style: CaptionStyle;
  } | null;
  scenes: TimelineScene[];
  music: BackgroundMusic | null;
  effects?: TimelineEffects | null;
};

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontFamily: "Inter",
  fontSize: 42,
  color: "#FFFFFF",
  position: "bottom",
  highlightCurrentWord: true,
  backgroundColor: "rgba(0,0,0,0.45)",
};

export const ASPECT_RATIO_OPTIONS: Array<{ value: TimelineAspectRatio; label: string }> = [
  { value: "16:9", label: "16:9 YouTube" },
  { value: "9:16", label: "9:16 Shorts" },
  { value: "1:1", label: "1:1 Square" },
];

export const DEFAULT_TIMELINE_EFFECTS: TimelineEffects = {
  brightness: 0,
  contrast: 0,
  gamma: 1,
  quickStyle: "none",
};

export const QUICK_STYLE_OPTIONS: Array<{ value: TimelineQuickStyle; label: string }> = [
  { value: "none", label: "Original" },
  { value: "grayscale", label: "Grayscale" },
  { value: "high-contrast", label: "Auto contrast" },
  { value: "warm", label: "Warm" },
  { value: "cool", label: "Cool" },
  { value: "vintage", label: "Vintage" },
];
