import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRecord } from "@/lib/types/project";
import type { VoiceGenerateJobPayload } from "@/lib/types/voice";
import { synthesizeSpeech } from "@/lib/providers/tts";
import { chunkScriptForTts } from "@/lib/voice/chunk-script";
import { concatMp3Buffers } from "@/lib/voice/concat-audio";
import { saveVoiceAsset, uploadFinalVoiceover } from "@/lib/voice/persist-audio";

export async function processVoiceJobStep(
  supabase: SupabaseClient,
  job: JobRecord,
  userId: string
): Promise<JobRecord> {
  const payload = job.payload as VoiceGenerateJobPayload;
  if (job.status === "completed" || job.status === "failed") return job;

  try {
    const next = await generateFullVoiceover(supabase, payload, userId);
    const { data, error } = await supabase
      .from("job_queue")
      .update({
        payload: next,
        progress: 100,
        status: "completed",
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return data as JobRecord;
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : "Voice job failed.";
    const { data } = await supabase
      .from("job_queue")
      .update({ status: "failed", error, updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .select("*")
      .single();
    return (data as JobRecord) || { ...job, status: "failed", error };
  }
}

async function generateFullVoiceover(
  supabase: SupabaseClient,
  payload: VoiceGenerateJobPayload,
  userId: string
): Promise<VoiceGenerateJobPayload> {
  const buffers: Buffer[] = [];
  let subtitles = payload.subtitles;
  let timeOffset = subtitles.length ? subtitles[subtitles.length - 1].end : 0;

  for (let index = 0; index < payload.chunks.length; index += 1) {
    const synthesized = await synthesizeSpeech(payload.chunks[index], payload.voiceId, timeOffset);
    buffers.push(synthesized.audio);
    subtitles = [...subtitles, ...synthesized.subtitles];
    timeOffset += synthesized.chunkDurationSeconds;
  }

  const finalAudio = await concatMp3Buffers(buffers);
  const uploaded = await uploadFinalVoiceover(supabase, userId, payload.projectId, finalAudio);
  const durationSeconds = subtitles.length
    ? subtitles[subtitles.length - 1].end
    : Math.max(1, finalAudio.length / 16000);

  const voiceAsset = await saveVoiceAsset(
    supabase,
    payload.projectId,
    payload.voiceId,
    uploaded.url,
    durationSeconds,
    subtitles
  );

  await supabase
    .from("projects")
    .update({ status: "in_progress", updated_at: new Date().toISOString() })
    .eq("id", payload.projectId);

  return {
    ...payload,
    currentIndex: payload.chunks.length,
    chunkPaths: [],
    subtitles,
    phase: "done",
    durationSeconds,
    audioUrl: uploaded.url,
    voiceAssetId: voiceAsset.id,
    message: "Voiceover ready.",
  };
}

export async function createVoiceGeneratePayload(
  supabase: SupabaseClient,
  projectId: string,
  voiceId: string,
  userId: string
): Promise<VoiceGenerateJobPayload> {
  const { data: project, error } = await supabase
    .from("projects")
    .select("script")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();

  if (error || !project?.script?.trim()) {
    throw new Error("Project script not found. Complete Module 1 first.");
  }

  const chunks = chunkScriptForTts(project.script);
  if (!chunks.length) throw new Error("Script is empty.");

  return {
    kind: "voice_generate",
    projectId,
    voiceId,
    phase: "synthesize",
    chunks,
    currentIndex: 0,
    chunkPaths: [],
    subtitles: [],
    message: `Synthesizing ${chunks.length} narration chunk${chunks.length === 1 ? "" : "s"}…`,
  };
}

export function voiceJobResponse(job: JobRecord) {
  const payload = job.payload as VoiceGenerateJobPayload;
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    message: payload.message,
    error: job.error,
    projectId: payload.projectId,
    audioUrl: payload.audioUrl ?? null,
    durationSeconds: payload.durationSeconds ?? null,
  };
}
