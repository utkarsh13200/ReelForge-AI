import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const projectId = process.argv[2] || "08ff30ad-ee0f-42d8-9885-b175cfdec46d";
const limit = Number(process.argv[3] || 3);

const { data: project } = await admin.from("projects").select("*").eq("id", projectId).single();
let { data: assets } = await admin
  .from("visual_assets")
  .select("*")
  .eq("project_id", projectId)
  .order("scene_index");

assets = (assets ?? []).slice(0, limit);
console.log("Testing assemble with", assets.length, "scenes, mode motion");

const { assembleVisualVideo } = await import("../lib/visuals/assemble-video.ts");
const r = await assembleVisualVideo(admin, project.user_id, projectId, {
  assets,
  script: project.script,
  mode: "motion",
});

await admin.from("projects").update({
  visual_video_url: r.url,
  visual_video_duration_seconds: r.durationSeconds,
}).eq("id", projectId);

console.log("SUCCESS", r.durationSeconds + "s", r.url);
