import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRecord } from "@/lib/types/project";
import type { ThumbnailGenerateJobPayload } from "@/lib/types/thumbnail";
import { persistThumbnailCandidate } from "@/lib/thumbnails/persist-thumbnail";

export async function processThumbnailJobStep(
  supabase: SupabaseClient,
  job: JobRecord,
  userId: string
): Promise<JobRecord> {
  const payload = job.payload as ThumbnailGenerateJobPayload;
  let progress = job.progress;
  let status: JobRecord["status"] = "running";
  let nextPayload = payload;
  let error: string | null = null;

  try {
    const result = await runGenerateStep(supabase, payload, userId);
    nextPayload = result.payload;
    progress = result.progress;
    status = result.status;

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
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Thumbnail job failed.";
    const { data } = await supabase
      .from("job_queue")
      .update({ status: "failed", error, updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .select("*")
      .single();
    return (data as JobRecord) || { ...job, status: "failed", error };
  }
}

async function runGenerateStep(
  supabase: SupabaseClient,
  payload: ThumbnailGenerateJobPayload,
  userId: string
) {
  if (payload.currentIndex >= payload.prompts.length) {
    return {
      payload: {
        ...payload,
        message: "All thumbnail candidates generated.",
      } satisfies ThumbnailGenerateJobPayload,
      progress: 100,
      status: "completed" as const,
    };
  }

  const remaining = payload.prompts.slice(payload.currentIndex);
  const rows = await Promise.all(
    remaining.map((prompt, offset) =>
      persistThumbnailCandidate(
        supabase,
        userId,
        payload.projectId,
        prompt,
        payload.currentIndex + offset,
        payload.headline
      )
    )
  );

  await supabase
    .from("projects")
    .update({ status: "in_progress", updated_at: new Date().toISOString() })
    .eq("id", payload.projectId);

  return {
    payload: {
      ...payload,
      currentIndex: payload.prompts.length,
      thumbnailIds: [...payload.thumbnailIds, ...rows.map((row) => row.id as string)],
      message: "All thumbnail candidates generated.",
    } satisfies ThumbnailGenerateJobPayload,
    progress: 100,
    status: "completed" as const,
  };
}

export function thumbnailJobResponse(job: JobRecord) {
  const payload = job.payload as ThumbnailGenerateJobPayload;
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    message: payload.message,
    error: job.error,
    projectId: payload.projectId,
    headline: payload.headline,
  };
}
