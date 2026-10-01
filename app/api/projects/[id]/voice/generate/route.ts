import { NextResponse } from "next/server";
import { finalizeDemoApi, requireApiUser } from "@/lib/auth/require-api-user";
import {
  continueVoiceJobInBackground,
  createVoiceGeneratePayload,
  processVoiceJobStep,
  voiceJobResponse,
} from "@/lib/jobs/voice-jobs";
import { isComingSoonVoice } from "@/lib/providers/tts";
import { preferSyncJobs } from "@/lib/runtime/platform";
import type { JobRecord } from "@/lib/types/project";
import type { VoiceGenerateJobPayload } from "@/lib/types/voice";

type Params = { params: { id: string } };

export const maxDuration = 300;

export async function POST(request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const supabase = auth.supabase!;
  const userId = auth.user.id;

  const body = (await request.json().catch(() => ({}))) as { voiceId?: string };
  const voiceId = body.voiceId?.trim();
  if (!voiceId) {
    return NextResponse.json({ error: "Select a voice before generating." }, { status: 400 });
  }
  if (isComingSoonVoice(voiceId)) {
    return NextResponse.json(
      { error: "This language is coming soon. Pick an English narrator for now." },
      { status: 400 }
    );
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

  if (!project.script?.trim()) {
    return NextResponse.json({ error: "Add a script in Module 1 first." }, { status: 400 });
  }

  let payload;
  try {
    payload = await createVoiceGeneratePayload(supabase, params.id, voiceId, userId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not prepare voice job." },
      { status: 400 }
    );
  }

  const { data: job, error: jobError } = await supabase
    .from("job_queue")
    .insert({
      user_id: userId,
      project_id: params.id,
      type: "voice_generate",
      payload,
      status: "queued",
      progress: 0,
    })
    .select("*")
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: jobError?.message || "Could not queue voice job." }, { status: 500 });
  }

  // On serverless, background runners die when the response ends — finish in-request.
  let processed = await processVoiceJobStep(
    supabase,
    { ...job, status: "running" } as JobRecord,
    userId
  );
  if (processed.status === "failed") {
    await finalizeDemoApi();
    return NextResponse.json(
      { error: processed.error || "Voice generation failed.", jobId: processed.id },
      { status: 502 }
    );
  }

  if (preferSyncJobs()) {
    while (processed.status === "queued" || processed.status === "running") {
      processed = await processVoiceJobStep(supabase, processed, userId);
      if (processed.status === "completed" || processed.status === "failed") break;
    }
  } else if (processed.status === "running") {
    continueVoiceJobInBackground(supabase, processed, userId);
  }

  const response = voiceJobResponse(processed);
  const processedPayload = processed.payload as VoiceGenerateJobPayload;
  await finalizeDemoApi();
  return NextResponse.json({
    ...response,
    jobId: processed.id,
    chunkCount: payload.chunks.length,
    audioUrl: processedPayload.audioUrl ?? null,
    durationSeconds: processedPayload.durationSeconds ?? null,
  });
}
