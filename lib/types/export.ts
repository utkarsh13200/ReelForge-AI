import type { TimelineJson } from "@/lib/types/timeline";

export type ExportJobRecord = {
  id: string;
  project_id: string;
  status: string;
  progress: number;
  output_url: string | null;
  created_at: string;
  completed_at: string | null;
};

export type ExportRenderJobPayload = {
  kind: "export_render";
  projectId: string;
  exportJobId: string;
  aspectRatio: TimelineJson["aspectRatio"];
  timeline: TimelineJson;
  visualVideoUrl?: string | null;
  outputUrl?: string;
  message: string;
};

export type ExportJobPayload = ExportRenderJobPayload;

export type ExportJobPollResponse = {
  id: string;
  status: string;
  progress: number;
  message: string;
  error: string | null;
  projectId: string;
  outputUrl?: string | null;
  exportJob?: ExportJobRecord | null;
};
