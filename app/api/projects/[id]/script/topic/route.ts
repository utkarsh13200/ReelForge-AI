import { NextResponse } from "next/server";
import { finalizeDemoApi, requireApiUser } from "@/lib/auth/require-api-user";
import { createTopicJobPayload } from "@/lib/script/topic-job";
import { jobResponse, processScriptJobStep } from "@/lib/jobs/script-jobs";
import { parseDurationMinutes, durationMinutesToTargetWords } from "@/lib/types/project";
import type { JobRecord } from "@/lib/types/project";
import { preferSyncJobs } from "@/lib/runtime/platform";

type Params = { params: { id: string } };

export const maxDuration = 120;

export async function POST(request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const supabase = auth.supabase!;
  const userId = auth.user.id;

  const body = (await request.json()) as {
    topic?: string;
    tone?: string;
    customTone?: string;
    duration?: string;
  };
  const topic = body.topic?.trim();
  if (!topic) return NextResponse.json({ error: "Topic is required." }, { status: 400 });

  const tone = body.tone || "educational";
  const customTone = body.customTone?.trim();
  const durationMinutes = parseDurationMinutes(body.duration);
  const duration = String(durationMinutes);
  const targetWords = durationMinutesToTargetWords(durationMinutes);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", userId)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  await supabase
    .from("projects")
    .update({
      title: topic.slice(0, 80),
      source_type: "topic",
      status: "in_progress",
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  const payload = createTopicJobPayload({
    projectId: params.id,
    topic,
    tone,
    customTone,
    duration,
    targetWords,
  });

  const { data: job, error: jobError } = await supabase
    .from("job_queue")
    .insert({
      user_id: userId,
      project_id: params.id,
      type: "script_topic",
      payload,
      status: "queued",
      progress: 0,
    })
    .select("*")
    .single();

  if (jobError || !job) return NextResponse.json({ error: jobError?.message || "Could not queue job." }, { status: 500 });

  // On Vercel, polls often hit another instance without the in-memory job — finish here.
  if (preferSyncJobs()) {
    const processed = await processScriptJobStep(supabase, { ...job, status: "running" } as JobRecord);
    await finalizeDemoApi();
    return NextResponse.json({
      ...jobResponse(processed),
      jobId: processed.id,
    });
  }

  await finalizeDemoApi();
  return NextResponse.json({ jobId: job.id });
}
