import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRecord } from "@/lib/types/project";
import type { JobPollResponse } from "@/lib/types/visual";
import { processScriptJobStep, jobResponse as scriptJobResponse } from "@/lib/jobs/script-jobs";
import { processVisualJobStep, visualJobResponse } from "@/lib/jobs/visual-jobs";
import { processVoiceJobStep, voiceJobResponse } from "@/lib/jobs/voice-jobs";
import { processThumbnailJobStep, thumbnailJobResponse } from "@/lib/jobs/thumbnail-jobs";
import { processExportJobStep, exportJobResponse } from "@/lib/jobs/export-jobs";

export async function processJobStep(
  supabase: SupabaseClient,
  job: JobRecord,
  userId: string
): Promise<JobRecord> {
  if (job.type.startsWith("script_")) {
    return processScriptJobStep(supabase, job);
  }
  if (job.type.startsWith("visual_")) {
    return processVisualJobStep(supabase, job, userId);
  }
  if (job.type.startsWith("voice_")) {
    return processVoiceJobStep(supabase, job, userId);
  }
  if (job.type.startsWith("thumbnail_")) {
    return processThumbnailJobStep(supabase, job, userId);
  }
  if (job.type.startsWith("export_")) {
    return processExportJobStep(supabase, job, userId);
  }
  throw new Error(`Unknown job type: ${job.type}`);
}

export function buildJobResponse(job: JobRecord): JobPollResponse {
  if (job.type.startsWith("script_")) {
    return scriptJobResponse(job);
  }
  if (job.type.startsWith("voice_")) {
    return voiceJobResponse(job);
  }
  if (job.type.startsWith("thumbnail_")) {
    return thumbnailJobResponse(job);
  }
  if (job.type.startsWith("export_")) {
    return exportJobResponse(job);
  }
  return visualJobResponse(job);
}
