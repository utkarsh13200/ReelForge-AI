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

/** ~150 spoken words per minute for YouTube narration. */
export const WORDS_PER_MINUTE = 150;

export function durationMinutesToTargetWords(minutes: number) {
  const clamped = Math.max(1, Math.min(30, Math.round(minutes)));
  return clamped * WORDS_PER_MINUTE;
}

export function parseDurationMinutes(duration: string | undefined) {
  if (!duration) return 1;
  const stripped = duration.replace(/min$/i, "").trim();
  const parsed = Number.parseInt(stripped, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(30, parsed);
}

export const DURATION_OPTIONS = Array.from({ length: 30 }, (_, index) => {
  const minutes = index + 1;
  return {
    value: String(minutes),
    label: minutes === 1 ? "1 min" : `${minutes} min`,
    targetWords: durationMinutesToTargetWords(minutes),
  };
}) as ReadonlyArray<{ value: string; label: string; targetWords: number }>;
