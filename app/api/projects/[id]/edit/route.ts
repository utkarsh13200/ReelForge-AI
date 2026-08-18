import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildDefaultTimeline, mergeTimelineAssets } from "@/lib/timeline/build-timeline";

type Params = { params: { id: string } };

export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const [{ data: visualAssets }, { data: voiceAsset }] = await Promise.all([
    supabase
      .from("visual_assets")
      .select("*")
      .eq("project_id", params.id)
      .order("scene_index", { ascending: true }),
    supabase
      .from("voice_assets")
      .select("*")
      .eq("project_id", params.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const assets = visualAssets ?? [];
  const voice = voiceAsset ?? null;
  const assembledVideoUrl = (project.visual_video_url as string | null) ?? null;
  const baseTimeline = project.timeline_json
    ? mergeTimelineAssets(
        buildDefaultTimeline(assets, voice, project.timeline_json, assembledVideoUrl),
        assets,
        voice
      )
    : buildDefaultTimeline(assets, voice, null, assembledVideoUrl);

  return NextResponse.json({
    project,
    visualAssets: assets,
    voiceAsset: voice,
    timeline: baseTimeline,
  });
}
