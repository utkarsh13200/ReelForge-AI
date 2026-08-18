import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processVisualJobStep } from "@/lib/jobs/visual-jobs";
import type { JobRecord } from "@/lib/types/project";
import type { VisualMode } from "@/lib/types/visual";

type Params = { params: { id: string } };

export const maxDuration = 300;

export async function POST(request: Request, { params }: Params) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { mode?: VisualMode; script?: string };
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
  if (!script) {
    return NextResponse.json({ error: "Write or generate a script in Module 1 first." }, { status: 400 });
  }

  const payload = {
    kind: "visual_split",
    projectId: params.id,
    mode,
    script,
    message: "Analyzing script and creating scene prompts…",
  };

  const { data: job, error: jobError } = await supabase
    .from("job_queue")
    .insert({
      user_id: user.id,
      project_id: params.id,
      type: "visual_split",
      payload,
      status: "running",
      progress: 0,
    })
    .select("*")
    .single();

  if (jobError || !job) return NextResponse.json({ error: jobError?.message || "Could not queue split." }, { status: 500 });

  const processed = await processVisualJobStep(supabase, job as JobRecord, user.id);
  if (processed.status === "failed") {
    return NextResponse.json(
      { error: processed.error || "Could not split the script.", jobId: processed.id },
      { status: 502 }
    );
  }
  return NextResponse.json({ jobId: processed.id });
}
