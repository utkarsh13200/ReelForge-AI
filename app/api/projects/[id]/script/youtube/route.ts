import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createYoutubeJobPayload } from "@/lib/script/youtube-job";

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    url?: string;
    modifyTranscript?: boolean;
    modifyInstructions?: string;
  };
  const url = body.url?.trim();
  if (!url) return NextResponse.json({ error: "YouTube URL is required." }, { status: 400 });

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  let payload;
  try {
    payload = createYoutubeJobPayload({
      projectId: params.id,
      url,
      modifyTranscript: body.modifyTranscript,
      modifyInstructions: body.modifyInstructions,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid YouTube URL." },
      { status: 400 }
    );
  }

  await supabase
    .from("projects")
    .update({
      title: "YouTube import",
      source_type: "youtube_url",
      source_url: url,
      status: "in_progress",
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  const { data: job, error: jobError } = await supabase
    .from("job_queue")
    .insert({
      user_id: user.id,
      project_id: params.id,
      type: "script_youtube",
      payload,
      status: "queued",
      progress: 0,
    })
    .select("*")
    .single();

  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });
  return NextResponse.json({ jobId: job.id });
}
