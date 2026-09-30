import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/require-api-user";
import { processVisualJobStep } from "@/lib/jobs/visual-jobs";
import type { JobRecord } from "@/lib/types/project";
import type { VisualMode } from "@/lib/types/visual";

type Params = { params: { id: string } };

export const maxDuration = 300;

export async function POST(request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const supabase = auth.supabase!;
  const userId = auth.user.id;

  const body = (await request.json().catch(() => ({}))) as { mode?: VisualMode; script?: string };
  const mode: VisualMode =
    body.mode === "motion" ? "motion" : body.mode === "video" ? "video" : "image";
  const incomingScript = typeof body.script === "string" ? body.script.trim() : "";

  if (incomingScript) {
    const { error: scriptError } = await supabase
      .from("projects")
      .update({ script: incomingScript, updated_at: new Date().toISOString() })
      .eq("id", params.id)
      .eq("user_id", userId);
    if (scriptError) return NextResponse.json({ error: scriptError.message }, { status: 500 });
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, script")
    .eq("id", params.id)
    .eq("user_id", userId)
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
      user_id: userId,
      project_id: params.id,
      type: "visual_split",
      payload,
      status: "running",
      progress: 0,
    })
    .select("*")
    .single();

  if (jobError || !job) return NextResponse.json({ error: jobError?.message || "Could not queue split." }, { status: 500 });

  const processed = await processVisualJobStep(supabase, job as JobRecord, userId);
  if (processed.status === "failed") {
    return NextResponse.json(
      { error: processed.error || "Could not split the script.", jobId: processed.id },
      { status: 502 }
    );
  }
  return NextResponse.json({ jobId: processed.id });
}
