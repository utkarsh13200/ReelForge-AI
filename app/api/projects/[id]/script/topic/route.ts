import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTopicJobPayload } from "@/lib/script/topic-job";
import { DURATION_OPTIONS } from "@/lib/types/project";

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  const duration = body.duration || "long";
  const targetWords =
    DURATION_OPTIONS.find((option) => option.value === duration)?.targetWords ?? 4500;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
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
      user_id: user.id,
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
