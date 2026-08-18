import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createVoiceGeneratePayload, processVoiceJobStep } from "@/lib/jobs/voice-jobs";
import type { JobRecord } from "@/lib/types/project";

type Params = { params: { id: string } };

export const maxDuration = 300;

export async function POST(request: Request, { params }: Params) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { voiceId?: string };
  const voiceId = body.voiceId?.trim();
  if (!voiceId) {
    return NextResponse.json({ error: "Select a voice before generating." }, { status: 400 });
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

  if (!project.script?.trim()) {
    return NextResponse.json({ error: "Add a script in Module 1 first." }, { status: 400 });
  }

  let payload;
  try {
    payload = await createVoiceGeneratePayload(supabase, params.id, voiceId, user.id);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not prepare voice job." },
      { status: 400 }
    );
  }

  const { data: job, error: jobError } = await supabase
    .from("job_queue")
    .insert({
      user_id: user.id,
      project_id: params.id,
      type: "voice_generate",
      payload,
      status: "queued",
      progress: 0,
    })
    .select("*")
    .single();

  if (jobError || !job) return NextResponse.json({ error: jobError?.message || "Could not queue voice job." }, { status: 500 });

  const processed = await processVoiceJobStep(supabase, { ...job, status: "running" } as JobRecord, user.id);
  if (processed.status === "failed") {
    return NextResponse.json(
      { error: processed.error || "Voice generation failed.", jobId: processed.id },
      { status: 502 }
    );
  }
  return NextResponse.json({ jobId: processed.id, chunkCount: payload.chunks.length });
}
