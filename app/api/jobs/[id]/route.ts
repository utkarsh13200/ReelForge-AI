import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/require-api-user";
import { buildJobResponse, processJobStep } from "@/lib/jobs/process-job";
import { attachVisualJobExtras, isVisualJobBusy } from "@/lib/jobs/visual-jobs";
import { continueVoiceJobInBackground, isVoiceJobBusy } from "@/lib/jobs/voice-jobs";
import type { JobRecord } from "@/lib/types/project";

type Params = { params: { id: string } };

export const maxDuration = 300;

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const supabase = auth.supabase!;
  const userId = auth.user.id;

  const { data: job, error } = await supabase
    .from("job_queue")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", userId)
    .single();

  if (error || !job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  let current = job as JobRecord;
  const workerHandlesExport = process.env.EXPORT_WORKER_MODE === "true";
  const deferExport = current.type.startsWith("export_");
  const deferToWorker = workerHandlesExport && deferExport;
  const skipVisualWork =
    current.type.startsWith("visual_") &&
    (current.status === "running" || isVisualJobBusy(current.id));
  const isVoice = current.type.startsWith("voice_");

  // Voice TTS can take tens of seconds per chunk — never block the poll HTTP request on it.
  // Kick (or resume) background work, then return the latest DB snapshot immediately.
  if (
    isVoice &&
    (current.status === "queued" || current.status === "running") &&
    !isVoiceJobBusy(current.id)
  ) {
    if (current.status === "queued") {
      await supabase.from("job_queue").update({ status: "running" }).eq("id", current.id);
      current = { ...current, status: "running" };
    }
    continueVoiceJobInBackground(supabase, current, userId);
  }

  if (
    (current.status === "queued" || current.status === "running") &&
    !deferToWorker &&
    !deferExport &&
    !skipVisualWork &&
    !isVoice
  ) {
    if (current.status === "queued") {
      await supabase.from("job_queue").update({ status: "running" }).eq("id", current.id);
      current = { ...current, status: "running" };
    }
    current = await processJobStep(supabase, current, userId);
  }

  if (isVoice && (current.status === "queued" || current.status === "running")) {
    const { data: fresh } = await supabase
      .from("job_queue")
      .select("*")
      .eq("id", current.id)
      .single();
    if (fresh) current = fresh as JobRecord;
  }

  const response = buildJobResponse(current);

  if (current.project_id && current.type.startsWith("visual_")) {
    Object.assign(response, await attachVisualJobExtras(supabase, current, response));
  }

  if (current.type.startsWith("export_")) {
    const payload = current.payload as { exportJobId?: string };
    if (payload.exportJobId) {
      const { data: exportJob } = await supabase
        .from("export_jobs")
        .select("*")
        .eq("id", payload.exportJobId)
        .maybeSingle();
      if (exportJob) {
        response.exportJob = exportJob;
        response.progress = exportJob.progress ?? response.progress;
        if (exportJob.output_url) response.outputUrl = exportJob.output_url;
      }
    }
  }

  if (current.project_id && current.type.startsWith("visual_")) {
    const { data: assets } = await supabase
      .from("visual_assets")
      .select("*")
      .eq("project_id", current.project_id)
      .order("scene_index", { ascending: true });
    if (assets?.length) response.assets = assets;
  }

  if (current.status === "completed" && current.project_id) {
    if (current.type.startsWith("visual_")) {
      // assets attached above
    } else if (current.type.startsWith("voice_")) {
      const { data: voiceAsset } = await supabase
        .from("voice_assets")
        .select("*")
        .eq("project_id", current.project_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (voiceAsset) response.voiceAsset = voiceAsset;
    }

    if (current.type.startsWith("thumbnail_")) {
      const { data: thumbnails } = await supabase
        .from("thumbnails")
        .select("*")
        .eq("project_id", current.project_id)
        .order("created_at", { ascending: true });
      if (thumbnails?.length) response.thumbnails = thumbnails;
    }
  }

  return NextResponse.json(response);
}
