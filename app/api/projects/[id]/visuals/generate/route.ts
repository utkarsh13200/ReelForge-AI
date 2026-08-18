import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { processVisualJobStep } from "@/lib/jobs/visual-jobs";
import type { JobRecord } from "@/lib/types/project";
import type { VisualMode } from "@/lib/types/visual";

type Params = { params: { id: string } };

export const maxDuration = 300;

async function enqueueAndProcessVisualJob(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  payload: Record<string, unknown>,
  progress: number
) {
  const { data: job, error: jobError } = await supabase
    .from("job_queue")
    .insert({
      user_id: userId,
      project_id: projectId,
      type: "visual_generate",
      payload,
      status: "running",
      progress,
    })
    .select("*")
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: jobError?.message || "Could not queue visual job." }, { status: 500 });
  }

  const processed = await processVisualJobStep(supabase, job as JobRecord, userId);
  if (processed.status === "failed") {
    return NextResponse.json(
      { error: processed.error || "Visual generation failed.", jobId: processed.id },
      { status: 502 }
    );
  }
  return NextResponse.json({ jobId: processed.id });
}

export async function POST(request: Request, { params }: Params) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    mode?: VisualMode;
    assetIds?: string[];
    onlyMissing?: boolean;
    assembleOnly?: boolean;
    fromScript?: boolean;
    script?: string;
  };
  const mode: VisualMode =
    body.mode === "motion" ? "motion" : body.mode === "video" ? "video" : "image";
  const incomingScript = typeof body.script === "string" ? body.script.trim() : "";

  if (incomingScript) {
    const { error: scriptError } = await supabase
      .from("projects")
      .update({ script: incomingScript, updated_at: new Date().toISOString() })
      .eq("id", params.id)
      .eq("user_id", user.id);
    if (scriptError) return NextResponse.json({ error: scriptError.message }, { status: 500 });
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, script")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const script = incomingScript || project.script?.trim() || "";

  let query = supabase
    .from("visual_assets")
    .select("id, mode, url")
    .eq("project_id", params.id)
    .order("scene_index", { ascending: true });

  if (body.assetIds?.length) {
    query = query.in("id", body.assetIds);
  }

  const { data: assets, error: assetsError } = await query;
  if (assetsError) return NextResponse.json({ error: assetsError.message }, { status: 500 });

  const allAssets = assets ?? [];

  if (body.fromScript) {
    if (!script) {
      return NextResponse.json({ error: "Add a script in Module 1 first." }, { status: 400 });
    }
    return enqueueAndProcessVisualJob(
      supabase,
      user.id,
      params.id,
      {
        kind: "visual_generate",
        projectId: params.id,
        mode,
        assetIds: allAssets.map((asset) => asset.id),
        currentIndex: 0,
        phase: "assemble",
        fromScript: true,
        script,
        message:
          mode === "video"
            ? "Generating video from your script with automatic provider fallback…"
            : "Building script-matched scenes and assembling your video…",
      },
      5
    );
  }

  if (body.assembleOnly) {
    const ready = allAssets.filter((asset) => asset.url || true);
    if (!ready.length) {
      return NextResponse.json({ error: "Split the script into scenes first." }, { status: 400 });
    }

    return enqueueAndProcessVisualJob(
      supabase,
      user.id,
      params.id,
      {
        kind: "visual_generate",
        projectId: params.id,
        mode,
        assetIds: ready.map((asset) => asset.id),
        currentIndex: ready.length,
        phase: "assemble",
        assembleOnly: true,
        script: script || undefined,
        message: "Assembling script-length silent video…",
      },
      90
    );
  }

  const targetAssets = body.onlyMissing
    ? allAssets.filter((asset) => !asset.url)
    : allAssets;

  if (!targetAssets.length) {
    return NextResponse.json(
      {
        error: body.onlyMissing
          ? "All scenes already have visuals."
          : "Split the script into scenes first.",
      },
      { status: 400 }
    );
  }

  await supabase
    .from("visual_assets")
    .update({ mode })
    .in(
      "id",
      targetAssets.map((asset) => asset.id)
    );

  return enqueueAndProcessVisualJob(
    supabase,
    user.id,
    params.id,
    {
      kind: "visual_generate",
      projectId: params.id,
      mode,
      assetIds: targetAssets.map((asset) => asset.id),
      currentIndex: targetAssets.length,
      phase: "assemble",
      assembleOnly: true,
      script: script || undefined,
      message: `Assembling ${targetAssets.length} scenes into script-length silent video…`,
    },
    10
  );
}
