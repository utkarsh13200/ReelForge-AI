export type ThumbnailOverlay = {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  align: "left" | "center" | "right";
};

export type Thumbnail = {
  id: string;
  project_id: string;
  url: string | null;
  prompt: string | null;
  headline: string | null;
  overlay_json: ThumbnailOverlay | null;
  is_selected: boolean;
  created_at: string;
};

export type ThumbnailGenerateJobPayload = {
  kind: "thumbnail_generate";
  projectId: string;
  prompts: string[];
  headline: string;
  currentIndex: number;
  thumbnailIds: string[];
  message: string;
};

export type ThumbnailJobPayload = ThumbnailGenerateJobPayload;

export type ThumbnailJobPollResponse = {
  id: string;
  status: string;
  progress: number;
  message: string;
  error: string | null;
  projectId: string;
  thumbnails?: Thumbnail[];
  headline?: string | null;
};

export const DEFAULT_THUMBNAIL_OVERLAY = (headline: string): ThumbnailOverlay => ({
  text: headline.toUpperCase().slice(0, 48),
  x: 80,
  y: 520,
  fontSize: 72,
  color: "#FFFFFF",
  strokeColor: "#000000",
  strokeWidth: 8,
  align: "left",
});
