import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRecord } from "@/lib/types/project";
import type { ExportRenderJobPayload } from "@/lib/types/export";
import { validateTimelineForExport } from "@/lib/export/validate-timeline";
import { renderProjectVideo } from "@/lib/export/render-video";
import { uploadExportVideo } from "@/lib/export/persist-export";

export async function processExportJobStep(
  supabase: SupabaseClient,
  job: JobRecord,
  userId: string
): Promise<JobRecord> {
  if (job.status === "completed" || job.status === "failed") return job;

  const payload = job.payload as ExportRenderJobPayload;
  let nextPayload = payload;
  let error: string | null = null;

  try {
    nextPayload = await runExportStep(supabase, payload, userId, job.id);

    const { data, error: updateError } = await supabase
      .from("job_queue")
      .update({
        payload: nextPayload,
        progress: 100,
        status: "completed",
        error,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .select("*")
      .single();

    if (updateError) throw new Error(updateError.message);
    return data as JobRecord;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Export render failed.";
    await supabase
      .from("export_jobs")
      .update({ status: "failed", progress: job.progress, completed_at: new Date().toISOString() })
      .eq("id", payload.exportJobId);

    const { data } = await supabase
      .from("job_queue")
      .update({ status: "failed", error, updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .select("*")
      .single();
    return (data as JobRecord) || { ...job, status: "failed", error };
  }
}

async function runExportStep(
  supabase: SupabaseClient,
  payload: ExportRenderJobPayload,
  userId: string,
  jobId: string
) {
  const timeline = validateTimelineForExport(
    {
      ...payload.timeline,
      aspectRatio: payload.aspectRatio,
    },
    payload.visualVideoUrl
  );

  await supabase
    .from("export_jobs")
    .update({ status: "running", progress: 0 })
    .eq("id", payload.exportJobId);

  const video = await renderProjectVideo(
    timeline,
    async (value, message) => {
      await supabase
        .from("job_queue")
        .update({ progress: value, updated_at: new Date().toISOString() })
        .eq("id", jobId);
      await supabase.from("export_jobs").update({ progress: value }).eq("id", payload.exportJobId);
      payload = { ...payload, message };
    },
    payload.visualVideoUrl
  );

  const outputUrl = await uploadExportVideo(
    supabase,
    userId,
    payload.projectId,
    payload.exportJobId,
    video
  );

  await supabase
    .from("export_jobs")
    .update({
      status: "completed",
      progress: 100,
      output_url: outputUrl,
      completed_at: new Date().toISOString(),
    })
    .eq("id", payload.exportJobId);

  await supabase
    .from("projects")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", payload.projectId);

  return {
    ...payload,
    outputUrl,
    message: "Export complete.",
  } satisfies ExportRenderJobPayload;
}

export function exportJobResponse(job: JobRecord) {
  const payload = job.payload as ExportRenderJobPayload;
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    message: payload.message,
    error: job.error,
    projectId: payload.projectId,
    outputUrl: payload.outputUrl ?? null,
    exportJobId: payload.exportJobId,
  };
}
