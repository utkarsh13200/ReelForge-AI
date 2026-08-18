import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildJobResponse, processJobStep } from "@/lib/jobs/process-job";
import { attachVisualJobExtras, isVisualJobBusy } from "@/lib/jobs/visual-jobs";
import type { JobRecord } from "@/lib/types/project";

type Params = { params: { id: string } };

export const maxDuration = 300;

export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: job, error } = await supabase
    .from("job_queue")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (error || !job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  let current = job as JobRecord;
  const workerHandlesExport = process.env.EXPORT_WORKER_MODE === "true";
  const deferExport = current.type.startsWith("export_");
  const deferToWorker = workerHandlesExport && deferExport;
  const skipVisualWork =
    current.type.startsWith("visual_") &&
    (current.status === "running" || isVisualJobBusy(current.id));

  if (
    (current.status === "queued" || current.status === "running") &&
    !deferToWorker &&
    !deferExport &&
    !skipVisualWork
  ) {
    if (current.status === "queued") {
      await supabase.from("job_queue").update({ status: "running" }).eq("id", current.id);
      current = { ...current, status: "running" };
    }
    current = await processJobStep(supabase, current, user.id);
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
