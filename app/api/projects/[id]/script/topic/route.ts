import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/require-api-user";
import { createTopicJobPayload } from "@/lib/script/topic-job";
import { parseDurationMinutes, durationMinutesToTargetWords } from "@/lib/types/project";

type Params = { params: { id: string } };

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

  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });
  return NextResponse.json({ jobId: job.id });
}
