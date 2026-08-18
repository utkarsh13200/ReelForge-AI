import type { SupabaseClient } from "@supabase/supabase-js";
import type { PipelineStatus } from "@/lib/project/pipeline-status";

export async function loadPipelineStatus(
  supabase: SupabaseClient,
  projectId: string
): Promise<PipelineStatus> {
  const [projectResult, visualsResult, voiceResult, thumbnailsResult, exportResult] = await Promise.all([
    supabase.from("projects").select("script, timeline_json, visual_video_url").eq("id", projectId).single(),
    supabase.from("visual_assets").select("url").eq("project_id", projectId),
    supabase
      .from("voice_assets")
      .select("audio_url")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("thumbnails").select("is_selected, url").eq("project_id", projectId),
    supabase
      .from("export_jobs")
      .select("status, output_url")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (projectResult.error || !projectResult.data) {
    throw new Error(projectResult.error?.message || "Project not found.");
  }

  const visualRows = visualsResult.data ?? [];
  const thumbnailRows = thumbnailsResult.data ?? [];
  const hasScript = Boolean(projectResult.data.script?.trim());
  const hasVisuals = visualRows.some((row) => row.url) || Boolean(projectResult.data.visual_video_url);
  const hasVoice = Boolean(voiceResult.data?.audio_url);
  const hasThumbnail = thumbnailRows.some((row) => row.is_selected && row.url);
  const hasTimeline = Boolean(projectResult.data.timeline_json) || (hasVisuals && hasVoice);
  const readyForExport = hasVisuals && hasVoice;
  const hasExport =
    exportResult.data?.status === "completed" && Boolean(exportResult.data.output_url);

  return {
    projectId,
    hasScript,
    hasVisuals,
    hasVoice,
    hasThumbnail,
    hasTimeline,
    readyForExport,
    hasExport,
  };
}
