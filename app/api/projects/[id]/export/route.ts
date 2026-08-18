import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildDefaultTimeline, mergeTimelineAssets } from "@/lib/timeline/build-timeline";
import { validateTimelineForExport } from "@/lib/export/validate-timeline";
import { loadPipelineStatus } from "@/lib/project/load-pipeline-status";
import { processExportJobStep } from "@/lib/jobs/export-jobs";
import type { JobRecord } from "@/lib/types/project";

type Params = { params: { id: string } };

export const maxDuration = 300;

export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const { data: exportJobs } = await supabase
    .from("export_jobs")
    .select("*")
    .eq("project_id", params.id)
    .order("created_at", { ascending: false })
    .limit(5);

  let pipeline = null;
  try {
    pipeline = await loadPipelineStatus(supabase, params.id);
  } catch {
    pipeline = null;
  }

  return NextResponse.json({
    project,
    exportJobs: exportJobs ?? [],
    latestExport: exportJobs?.[0] ?? null,
    pipeline,
  });
}

export async function POST(request: Request, { params }: Params) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { aspectRatio?: "16:9" | "9:16" | "1:1" };

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const [{ data: visualAssets }, { data: voiceAsset }] = await Promise.all([
    supabase
      .from("visual_assets")
      .select("*")
      .eq("project_id", params.id)
      .order("scene_index", { ascending: true }),
    supabase
      .from("voice_assets")
      .select("*")
      .eq("project_id", params.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const assets = visualAssets ?? [];
  const voice = voiceAsset ?? null;
  const visualVideoUrl = (project.visual_video_url as string | null) ?? null;
  const baseTimeline = project.timeline_json
    ? mergeTimelineAssets(
        buildDefaultTimeline(assets, voice, project.timeline_json, visualVideoUrl),
        assets,
        voice
      )
    : buildDefaultTimeline(assets, voice, null, visualVideoUrl);

  const aspectRatio = body.aspectRatio ?? baseTimeline.aspectRatio;

  let timeline;
  try {
    timeline = validateTimelineForExport({ ...baseTimeline, aspectRatio }, visualVideoUrl);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Timeline is not ready for export." },
      { status: 400 }
    );
  }

  const { data: exportJob, error: exportError } = await supabase
    .from("export_jobs")
    .insert({
      project_id: params.id,
      status: "queued",
      progress: 0,
    })
    .select("*")
    .single();

  if (exportError || !exportJob) {
    return NextResponse.json({ error: exportError?.message || "Could not create export job." }, { status: 500 });
  }

  const payload = {
    kind: "export_render" as const,
    projectId: params.id,
    exportJobId: exportJob.id,
    aspectRatio,
    timeline,
    visualVideoUrl,
    message: "Mixing visuals, voice, and captions…",
  };

  const { data: job, error: jobError } = await supabase
    .from("job_queue")
    .insert({
      user_id: user.id,
      project_id: params.id,
      type: "export_render",
      payload,
      status: "queued",
      progress: 0,
    })
    .select("*")
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: jobError?.message || "Could not queue export." }, { status: 500 });
  }

  if (process.env.EXPORT_WORKER_MODE === "true") {
    return NextResponse.json({ jobId: job.id, exportJobId: exportJob.id, aspectRatio, status: "queued" });
  }

  const processed = await processExportJobStep(supabase, { ...job, status: "running" } as JobRecord, user.id);
  if (processed.status === "failed") {
    return NextResponse.json(
      { error: processed.error || "Export failed.", jobId: processed.id, exportJobId: exportJob.id },
      { status: 502 }
    );
  }

  const processedPayload = processed.payload as { outputUrl?: string };
  return NextResponse.json({
    jobId: processed.id,
    exportJobId: exportJob.id,
    aspectRatio,
    status: processed.status,
    outputUrl: processedPayload.outputUrl ?? null,
    message: "Export complete.",
  });
}
