import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRecord, ScriptJobPayload } from "@/lib/types/project";
import { countWords } from "@/lib/script/utils";
import { advanceTopicJob } from "@/lib/script/topic-job";
import { advanceYoutubeJob } from "@/lib/script/youtube-job";

const MAX_STEPS_PER_POLL = 20;

async function runSingleScriptStep(
  supabase: SupabaseClient,
  job: JobRecord
): Promise<JobRecord> {
  const payload = job.payload as ScriptJobPayload;
  let nextPayload: ScriptJobPayload;
  let progress = job.progress;
  let status: JobRecord["status"] = "running";
  const error: string | null = null;

  if (payload.kind === "script_topic") {
    if (payload.phase === "done") {
      status = "completed";
      progress = 100;
      nextPayload = payload;
    } else {
      nextPayload = await advanceTopicJob(payload);
      if (nextPayload.phase === "done") {
        progress = 100;
        status = "completed";
      } else if (nextPayload.phase === "sections") {
        progress = Math.min(
          95,
          10 + Math.round((nextPayload.currentSection / nextPayload.totalSections) * 85)
        );
      } else {
        progress = 5;
      }
    }
  } else if (payload.phase === "done") {
    status = "completed";
    progress = 100;
    nextPayload = payload;
  } else {
    nextPayload = await advanceYoutubeJob(payload);
    if (nextPayload.phase === "fetch") progress = 20;
    else if (nextPayload.phase === "clean") progress = 60;
    else {
      progress = 100;
      status = "completed";
    }
  }

  if (status === "completed" && nextPayload.script) {
    await supabase
      .from("projects")
      .update({
        script: nextPayload.script,
        script_word_count: countWords(nextPayload.script),
        updated_at: new Date().toISOString(),
      })
      .eq("id", nextPayload.projectId);
  } else if (nextPayload.script && payload.kind === "script_topic") {
    await supabase
      .from("projects")
      .update({
        script: nextPayload.script,
        script_word_count: countWords(nextPayload.script),
        updated_at: new Date().toISOString(),
      })
      .eq("id", nextPayload.projectId);
  }

  const { data, error: updateError } = await supabase
    .from("job_queue")
    .update({
      payload: nextPayload,
      progress,
      status,
      error,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .select("*")
    .single();

  if (updateError) throw new Error(updateError.message);
  return data as JobRecord;
}

export async function processScriptJobStep(
  supabase: SupabaseClient,
  job: JobRecord
): Promise<JobRecord> {
  try {
    let current = job;
    for (let step = 0; step < MAX_STEPS_PER_POLL; step += 1) {
      if (current.status === "completed" || current.status === "failed") break;
      current = await runSingleScriptStep(supabase, current);
      if (current.status === "completed" || current.status === "failed") break;
    }
    return current;
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : "Script job failed.";
    const { data } = await supabase
      .from("job_queue")
      .update({ status: "failed", error, updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .select("*")
      .single();
    return (data as JobRecord) || { ...job, status: "failed", error };
  }
}

export function jobResponse(job: JobRecord) {
  const payload = job.payload as ScriptJobPayload;
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    message: payload.message,
    error: job.error,
    script: payload.script || null,
    projectId: payload.projectId,
  };
}
