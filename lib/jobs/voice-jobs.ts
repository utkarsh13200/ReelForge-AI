import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRecord } from "@/lib/types/project";
import type { VoiceGenerateJobPayload } from "@/lib/types/voice";
import { synthesizeSpeech } from "@/lib/providers/tts";
import { chunkScriptForTts } from "@/lib/voice/chunk-script";
import { concatMp3Buffers } from "@/lib/voice/concat-audio";
import {
  downloadVoiceChunks,
  saveVoiceAsset,
  uploadFinalVoiceover,
  uploadVoiceChunk,
} from "@/lib/voice/persist-audio";

type VoiceGlobals = typeof globalThis & {
  __reelforgeVoiceLocks?: Map<string, Promise<JobRecord>>;
  __reelforgeVoiceRunners?: Set<string>;
};

const g = globalThis as VoiceGlobals;
const voiceJobLocks = g.__reelforgeVoiceLocks ?? new Map<string, Promise<JobRecord>>();
const voiceJobRunners = g.__reelforgeVoiceRunners ?? new Set<string>();
g.__reelforgeVoiceLocks = voiceJobLocks;
g.__reelforgeVoiceRunners = voiceJobRunners;

const VOICE_STEP_HARD_TIMEOUT_MS = 90_000;

export function isVoiceJobBusy(jobId: string) {
  return voiceJobLocks.has(jobId) || voiceJobRunners.has(jobId);
}

/** Wait for an in-flight voice step (used by background runner, not by HTTP polls). */
export function awaitBusyVoiceJob(jobId: string): Promise<JobRecord> | null {
  return voiceJobLocks.get(jobId) ?? null;
}

/**
 * Keep synthesizing remaining chunks in the background so GET /api/jobs stays fast.
 * Safe to call multiple times — only one runner per job.
 * Held on globalThis so Next.js request teardown cannot drop the runner.
 */
export function continueVoiceJobInBackground(
  supabase: SupabaseClient,
  job: JobRecord,
  userId: string
) {
  if (job.status === "completed" || job.status === "failed") return;
  if (voiceJobRunners.has(job.id)) return;
  voiceJobRunners.add(job.id);

  const run = (async () => {
    try {
      let current = job;
      while (current.status === "queued" || current.status === "running") {
        current = await processVoiceJobStep(supabase, current, userId);
        if (current.status === "completed" || current.status === "failed") break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } finally {
      voiceJobRunners.delete(job.id);
    }
  })();

  // Prevent unhandled rejection from killing the runner silently.
  void run.catch((error) => {
    console.error("[voice] background runner failed", job.id, error);
    voiceJobRunners.delete(job.id);
  });
}

/** Advance one voice step (chunk or concat). Poll GET /api/jobs until completed. */
export async function processVoiceJobStep(
  supabase: SupabaseClient,
  job: JobRecord,
  userId: string
): Promise<JobRecord> {
  const existing = voiceJobLocks.get(job.id);
  if (existing) return existing;

  let hardTimer: ReturnType<typeof setTimeout> | undefined;
  const work = Promise.race([
    runVoiceJobStep(supabase, job, userId),
    new Promise<JobRecord>((_, reject) => {
      hardTimer = setTimeout(
        () => reject(new Error("Voice step timed out. Try Generate again.")),
        VOICE_STEP_HARD_TIMEOUT_MS
      );
    }),
  ])
    .catch(async (caught) => {
      // Only treat as failure if the step did not already finish successfully.
      const { data: latest } = await supabase
        .from("job_queue")
        .select("*")
        .eq("id", job.id)
        .maybeSingle();
      if (latest && (latest as JobRecord).status === "completed") {
        return latest as JobRecord;
      }
      if (latest && (latest as JobRecord).status === "failed") {
        return latest as JobRecord;
      }
      const error = caught instanceof Error ? caught.message : "Voice job failed.";
      const { data } = await supabase
        .from("job_queue")
        .update({ status: "failed", error, updated_at: new Date().toISOString() })
        .eq("id", job.id)
        .select("*")
        .single();
      return (data as JobRecord) || { ...job, status: "failed" as const, error };
    })
    .finally(() => {
      if (hardTimer) clearTimeout(hardTimer);
      voiceJobLocks.delete(job.id);
    });
  voiceJobLocks.set(job.id, work);
  return work;
}

async function runVoiceJobStep(
  supabase: SupabaseClient,
  job: JobRecord,
  userId: string
): Promise<JobRecord> {
  const payload = job.payload as VoiceGenerateJobPayload;
  if (job.status === "completed" || job.status === "failed") return job;

  try {
    let nextPayload = payload;
    let progress = job.progress;
    let status: JobRecord["status"] = "running";

    if (payload.phase === "synthesize" || !payload.phase) {
      const index = payload.currentIndex ?? 0;
      const total = payload.chunks.length;
      if (index >= total) {
        nextPayload = {
          ...payload,
          phase: "concat",
          message: "Mixing voiceover audio…",
        };
        progress = 90;
      } else {
        // Publish in-progress status before the slow TTS call so the UI does not freeze.
        await supabase
          .from("job_queue")
          .update({
            payload: {
              ...payload,
              message: `Synthesizing ${index + 1} of ${total}…`,
            },
            progress: Math.min(85, Math.round((index / Math.max(1, total)) * 88) + 4),
            status: "running",
            error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        const timeOffset = payload.subtitles.length
          ? payload.subtitles[payload.subtitles.length - 1].end
          : 0;
        const synthesized = await synthesizeSpeech(payload.chunks[index], payload.voiceId, timeOffset);
        const chunkPath = await uploadVoiceChunk(
          supabase,
          userId,
          payload.projectId,
          index,
          synthesized.audio
        );
        nextPayload = {
          ...payload,
          currentIndex: index + 1,
          chunkPaths: [...payload.chunkPaths, chunkPath],
          subtitles: [...payload.subtitles, ...synthesized.subtitles],
          phase: index + 1 >= total ? "concat" : "synthesize",
          message:
            index + 1 >= total
              ? "Mixing voiceover audio…"
              : `Synthesized ${index + 1} of ${total} — continuing…`,
        };
        progress = Math.min(88, Math.round(((index + 1) / Math.max(1, total)) * 88));
      }
    }

    if (nextPayload.phase === "concat") {
      nextPayload = await finalizeVoiceover(supabase, nextPayload, userId);
      progress = 100;
      status = "completed";
    }

    const { data, error } = await supabase
      .from("job_queue")
      .update({
        payload: nextPayload,
        progress,
        status,
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

async function finalizeVoiceover(
  supabase: SupabaseClient,
  payload: VoiceGenerateJobPayload,
  userId: string
): Promise<VoiceGenerateJobPayload> {
  const buffers = await downloadVoiceChunks(supabase, payload.chunkPaths);
  const finalAudio = await concatMp3Buffers(buffers);
  const uploaded = await uploadFinalVoiceover(supabase, userId, payload.projectId, finalAudio);
  const durationSeconds = payload.subtitles.length
    ? payload.subtitles[payload.subtitles.length - 1].end
    : Math.max(1, finalAudio.length / 16000);

  const voiceAsset = await saveVoiceAsset(
    supabase,
    payload.projectId,
    payload.voiceId,
    uploaded.url,
    durationSeconds,
    payload.subtitles
  );

  await supabase
    .from("projects")
    .update({ status: "in_progress", updated_at: new Date().toISOString() })
    .eq("id", payload.projectId);

  return {
    ...payload,
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
