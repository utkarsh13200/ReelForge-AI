export type VisualMode = "image" | "motion" | "video";

export type VisualAsset = {
  id: string;
  project_id: string;
  type: "image" | "video";
  prompt: string | null;
  url: string | null;
  scene_index: number;
  scene_title: string | null;
  scene_beat: string | null;
  mode: VisualMode;
  created_at: string;
};

export type SceneBeat = {
  title: string;
  beat: string;
  prompt: string;
};

export type VisualSplitJobPayload = {
  kind: "visual_split";
  projectId: string;
  mode: VisualMode;
  message: string;
  sceneCount?: number;
  script?: string;
};

export type VisualGenerateJobPayload = {
  kind: "visual_generate";
  projectId: string;
  mode: VisualMode;
  assetIds: string[];
  currentIndex: number;
  message: string;
  phase: "generate" | "assemble";
  script?: string;
  assembleOnly?: boolean;
  fromScript?: boolean;
};

export type VisualRegenerateJobPayload = {
  kind: "visual_regenerate";
  projectId: string;
  assetId: string;
  mode: VisualMode;
  prompt: string;
  message: string;
  phase: "generate" | "done";
};

export type VisualJobPayload =
  | VisualSplitJobPayload
  | VisualGenerateJobPayload
  | VisualRegenerateJobPayload;

import type { VoiceAsset } from "@/lib/types/voice";
import type { Thumbnail } from "@/lib/types/thumbnail";
import type { ExportJobRecord } from "@/lib/types/export";

export type JobPollResponse = {
  id: string;
  status: string;
  progress: number;
  message: string;
  error: string | null;
  projectId: string;
  script?: string | null;
  assets?: VisualAsset[];
  voiceAsset?: VoiceAsset | null;
  audioUrl?: string | null;
  durationSeconds?: number | null;
  thumbnails?: Thumbnail[];
  headline?: string | null;
  outputUrl?: string | null;
  sceneCount?: number | null;
  visualVideoUrl?: string | null;
  visualVideoDurationSeconds?: number | null;
  exportJob?: ExportJobRecord | null;
};
