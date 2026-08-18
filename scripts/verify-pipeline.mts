/**
 * End-to-end check: split a script, assemble the silent video, then probe the
 * result and dump preview frames. Run with: npm run verify:pipeline
 */
import { execFile } from "child_process";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { promisify } from "util";
import { createClient } from "@supabase/supabase-js";
import { splitScriptIntoScenes } from "../lib/visuals/scene-split";
import { assembleVisualVideo } from "../lib/visuals/assemble-video";
import { computeScenePlan } from "../lib/visuals/scene-count";
import { describeImageProvider } from "../lib/providers/image";
import { resolveFfmpegPath } from "../lib/visuals/ffmpeg-path";
import type { VisualMode } from "../lib/types/visual";

const SCRIPT = `The Egyptian Pyramids, Cairo, 1920. This was an era of great discovery and exploration in the ancient city. The pyramids, towering above the desert sands, stood as testaments to the ingenuity and skill of the Egyptians who built them.

As we delve into the history of these magnificent structures, we find ourselves drawn into a world of mystery and wonder. The pyramids have captivated the imagination of people for centuries, and it is easy to see why. Their sheer scale and precision engineering are a marvel, even by today's standards.

In the early 20th century, the city of Cairo was a hub of archaeological activity, with many expeditions and excavations taking place in and around the pyramids. It was an exciting time, with new discoveries being made regularly, and our understanding of ancient Egyptian culture and history expanding rapidly. The pyramids, in particular, were a major focus of attention, with many scholars and adventurers seeking to uncover their secrets.`;

const mode = ((process.argv[2] as VisualMode) || "motion") satisfies VisualMode;
const execFileAsync = promisify(execFile);

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

console.log("image provider:", describeImageProvider());
console.log("mode:", mode);

const started = Date.now();
const plan = computeScenePlan(SCRIPT, mode);
console.log("plan:", plan);

const scenes = await splitScriptIntoScenes(SCRIPT, mode);
console.log(`split: ${Date.now() - started}ms, ${scenes.length} scenes`);

const { data: project } = await admin
  .from("projects")
  .select("*")
  .order("updated_at", { ascending: false })
  .limit(1)
  .single();

if (!project) throw new Error("No project found to test against.");

await admin.from("visual_assets").delete().eq("project_id", project.id);
await admin.from("visual_assets").insert(
  scenes.map((scene, index) => ({
    project_id: project.id,
    scene_index: index,
    scene_title: scene.title,
    scene_beat: scene.beat,
    prompt: scene.prompt.slice(0, 500),
    type: "image",
    mode,
    url: null,
  }))
);

const { data: assets } = await admin
  .from("visual_assets")
  .select("*")
  .eq("project_id", project.id)
  .order("scene_index");

const assembleStarted = Date.now();
const result = await assembleVisualVideo(admin, project.user_id, project.id, {
  assets: assets ?? [],
  script: SCRIPT,
  mode,
});

await admin
  .from("projects")
  .update({
    visual_video_url: result.url,
    visual_video_duration_seconds: result.durationSeconds,
    updated_at: new Date().toISOString(),
  })
  .eq("id", project.id);

console.log(`assemble: ${Date.now() - assembleStarted}ms`);
console.log(`TOTAL: ${Date.now() - started}ms  (${result.durationSeconds}s video)`);

const outDir = join("scripts", "video-check");
await mkdir(outDir, { recursive: true });
const response = await fetch(result.url);
const bytes = Buffer.from(await response.arrayBuffer());
const videoPath = join(outDir, `${mode}.mp4`);
await writeFile(videoPath, new Uint8Array(bytes));
console.log("size:", (bytes.length / 1024 / 1024).toFixed(2), "MB");

const ffmpeg = await resolveFfmpegPath();
const { stderr } = await execFileAsync(ffmpeg, ["-i", videoPath, "-f", "null", "-"]).catch(
  (error: { stderr?: string }) => ({ stderr: error.stderr ?? "" })
);
const info = stderr.split("\n").filter((l) => /Duration:|Stream #0:0|^frame=/.test(l.trim()));
console.log("\nprobe:\n" + info.slice(0, 2).join("\n") + "\n" + (info.at(-1) ?? ""));

for (const at of ["1", "15", "32", "50"]) {
  await execFileAsync(ffmpeg, [
    "-y", "-ss", at, "-i", videoPath, "-frames:v", "1", join(outDir, `${mode}-frame-${at}s.jpg`),
  ]).catch(() => undefined);
}
console.log(`\nFrames written to ${outDir}`);
