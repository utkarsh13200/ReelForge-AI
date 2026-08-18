export type SourceType = "topic" | "youtube_url";

export type Project = {
  id: string;
  user_id: string;
  title: string;
  script: string | null;
  script_word_count: number | null;
  source_type: SourceType | null;
  source_url: string | null;
  timeline_json: unknown | null;
  visual_video_url: string | null;
  visual_video_duration_seconds: number | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type JobStatus = "queued" | "running" | "completed" | "failed";

export type JobRecord = {
  id: string;
  user_id: string;
  project_id: string | null;
  type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  progress: number;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type ScriptTopicJobPayload = {
  kind: "script_topic";
  projectId: string;
  topic: string;
  tone: string;
  customTone?: string;
  duration: string;
  targetWords: number;
  phase: "outline" | "sections" | "done";
  outline: string[];
  currentSection: number;
  totalSections: number;
  sections: string[];
  script: string;
  message: string;
};

export type ScriptYoutubeJobPayload = {
  kind: "script_youtube";
  projectId: string;
  url: string;
  videoId: string;
  phase: "fetch" | "clean" | "done";
  rawTranscript: string;
  script: string;
  modifyTranscript: boolean;
  modifyInstructions: string;
  message: string;
};

export type ScriptJobPayload = ScriptTopicJobPayload | ScriptYoutubeJobPayload;

export const TONE_OPTIONS = [
  { value: "educational", label: "Educational" },
  { value: "storytelling", label: "Storytelling" },
  { value: "comedic", label: "Comedic" },
  { value: "documentary", label: "Documentary" },
  { value: "others", label: "Others" },
] as const;

export const DURATION_OPTIONS = [
  { value: "short", label: "Short (~8 min)", targetWords: 1200 },
  { value: "long", label: "Long-form (~30 min)", targetWords: 4500 },
] as const;
