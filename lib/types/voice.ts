export type WordTimestamp = {
  word: string;
  start: number;
  end: number;
};

export type VoiceOption = {
  id: string;
  label: string;
  locale: string;
  gender: "Female" | "Male";
  comingSoon?: boolean;
};

export type VoiceAsset = {
  id: string;
  project_id: string;
  audio_url: string | null;
  voice_id: string | null;
  duration_seconds: number | null;
  word_timestamps_json: WordTimestamp[] | null;
  created_at: string;
};

export type VoiceGenerateJobPayload = {
  kind: "voice_generate";
  projectId: string;
  voiceId: string;
  phase: "synthesize" | "concat" | "done";
  chunks: string[];
  currentIndex: number;
  chunkPaths: string[];
  subtitles: WordTimestamp[];
  durationSeconds?: number;
  audioUrl?: string;
  voiceAssetId?: string;
  message: string;
};

export type VoiceJobPayload = VoiceGenerateJobPayload;

export type VoiceJobPollResponse = {
  id: string;
  status: string;
  progress: number;
  message: string;
  error: string | null;
  projectId: string;
  voiceAsset?: VoiceAsset | null;
};
