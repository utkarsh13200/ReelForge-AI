import { createClient } from "@supabase/supabase-js";

const PYRAMID = `The Egyptian Pyramids, Cairo, 1920. This was an era of great discovery and exploration in the ancient city. The pyramids, towering above the desert sands, stood as testaments to the ingenuity and skill of the Egyptians who built them.

As we delve into the history of these magnificent structures, we find ourselves drawn into a world of mystery and wonder. The pyramids have captivated the imagination of people for centuries, and it is easy to see why. Their sheer scale and precision engineering are a marvel, even by today's standards.

In the early 20th century, the city of Cairo was a hub of archaeological activity, with many expeditions and excavations taking place in and around the pyramids. It was an exciting time, with new discoveries being made regularly, and our understanding of ancient Egyptian culture and history expanding rapidly. The pyramids, in particular, were a major focus of attention, with many scholars and adventurers seeking to uncover their secrets.`;

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const start = Date.now();
const { splitScriptIntoScenes } = await import("../lib/visuals/scene-split.ts");
const { assembleVisualVideo } = await import("../lib/visuals/assemble-video.ts");
const { computeScenePlan } = await import("../lib/visuals/scene-count.ts");

const plan = computeScenePlan(PYRAMID, "motion");
console.log("plan:", plan);

const scenes = await splitScriptIntoScenes(PYRAMID, "motion");
console.log("split:", Date.now() - start, "ms,", scenes.length, "scenes");

const { data: project } = await admin
  .from("projects")
  .select("*")
  .order("updated_at", { ascending: false })
  .limit(1)
  .single();

await admin.from("visual_assets").delete().eq("project_id", project.id);
const rows = scenes.map((scene, i) => ({
  project_id: project.id,
  scene_index: i,
  scene_title: scene.title,
  scene_beat: scene.beat,
  prompt: scene.prompt,
  type: "image",
  mode: "motion",
  url: null,
}));
await admin.from("visual_assets").insert(rows);
const { data: assets } = await admin.from("visual_assets").select("*").eq("project_id", project.id);

const t1 = Date.now();
const result = await assembleVisualVideo(admin, project.user_id, project.id, {
  assets: assets ?? [],
  script: PYRAMID,
  mode: "motion",
});
console.log("assemble:", Date.now() - t1, "ms");
console.log("TOTAL:", Date.now() - start, "ms", result.durationSeconds + "s video", result.url.slice(0, 90));
