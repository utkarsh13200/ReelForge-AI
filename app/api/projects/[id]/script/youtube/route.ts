import { NextResponse } from "next/server";
import { finalizeDemoApi, requireApiUser } from "@/lib/auth/require-api-user";
import { createYoutubeJobPayload } from "@/lib/script/youtube-job";
import { jobResponse, processScriptJobStep } from "@/lib/jobs/script-jobs";
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
    .eq("user_id", userId)
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
      user_id: userId,
      project_id: params.id,
      type: "script_youtube",
      payload,
      status: "queued",
      progress: 0,
    })
    .select("*")
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: jobError?.message || "Could not queue job." }, { status: 500 });
  }

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
