import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processVisualJobStep } from "@/lib/jobs/visual-jobs";
import type { JobRecord } from "@/lib/types/project";
import type { VisualMode } from "@/lib/types/visual";

type Params = { params: { id: string; assetId: string } };

export const maxDuration = 300;

export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { prompt?: string; mode?: VisualMode };
  const updates: Record<string, unknown> = {};
  if (typeof body.prompt === "string") updates.prompt = body.prompt.trim();
  if (body.mode === "image" || body.mode === "motion" || body.mode === "video") updates.mode = body.mode;

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const { data, error } = await supabase
    .from("visual_assets")
    .update(updates)
    .eq("id", params.assetId)
    .eq("project_id", params.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ asset: data });
}

export async function POST(request: Request, { params }: Params) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { prompt?: string; mode?: VisualMode };

  const { data: asset, error: assetError } = await supabase
    .from("visual_assets")
    .select("*")
    .eq("id", params.assetId)
    .eq("project_id", params.id)
    .single();

  if (assetError || !asset) {
    return NextResponse.json({ error: "Scene not found." }, { status: 404 });
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const prompt = (body.prompt ?? asset.prompt ?? "").trim();
  if (!prompt) return NextResponse.json({ error: "Prompt is required." }, { status: 400 });

  const mode: VisualMode =
    body.mode === "motion"
      ? "motion"
      : body.mode === "video"
        ? "video"
        : body.mode === "image"
          ? "image"
          : (asset.mode as VisualMode);

  const payload = {
    kind: "visual_regenerate",
    projectId: params.id,
    assetId: params.assetId,
    mode,
    prompt,
    message: `Regenerating scene ${asset.scene_index + 1}…`,
    phase: "generate",
  };

  const { data: job, error: jobError } = await supabase
    .from("job_queue")
    .insert({
      user_id: user.id,
      project_id: params.id,
      type: "visual_regenerate",
      payload,
      status: "running",
      progress: 0,
    })
    .select("*")
    .single();

  if (jobError || !job) return NextResponse.json({ error: jobError?.message || "Could not queue regenerate." }, { status: 500 });

  const processed = await processVisualJobStep(supabase, job as JobRecord, user.id);
  if (processed.status === "failed") {
    return NextResponse.json(
      { error: processed.error || "Could not regenerate scene.", jobId: processed.id },
      { status: 502 }
    );
  }
  return NextResponse.json({ jobId: processed.id });
}
