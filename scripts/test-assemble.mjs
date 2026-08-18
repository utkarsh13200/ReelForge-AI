import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const projectId = process.argv[2] || "08ff30ad-ee0f-42d8-9885-b175cfdec46d";

const { data: project } = await admin.from("projects").select("*").eq("id", projectId).single();
const { data: assets } = await admin
  .from("visual_assets")
  .select("*")
  .eq("project_id", projectId)
  .order("scene_index");

console.log("script words:", project?.script?.split(/\s+/).length);
console.log("visual_video_url:", project?.visual_video_url ? "YES" : "NONE");
console.log("assets:", assets?.length, "with url:", assets?.filter((a) => a.url).length);

const { data: jobs } = await admin
  .from("job_queue")
  .select("status, error, payload, type, updated_at")
  .eq("project_id", projectId)
  .order("updated_at", { ascending: false })
  .limit(3);

for (const j of jobs ?? []) {
  console.log("job:", j.type, j.status, j.error || j.payload?.message);
}

try {
  const { assembleVisualVideo } = await import("../lib/visuals/assemble-video.ts");
  const r = await assembleVisualVideo(admin, project.user_id, projectId, {
    assets: assets ?? [],
    script: project.script,
    mode: "motion",
  });
  console.log("ASSEMBLE OK", r.durationSeconds + "s", r.url.slice(0, 100));
} catch (e) {
  console.error("ASSEMBLE FAIL:", e.message);
  process.exit(1);
}
