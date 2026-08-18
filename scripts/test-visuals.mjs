/**
 * End-to-end visuals pipeline diagnostic. Run: node --env-file=.env.local scripts/test-visuals.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const TEST_SCRIPT = `Intro: Welcome to our story about mountain adventures.

Scene one: A hiker stands at the trailhead as golden sun breaks through clouds.

Scene two: The path winds through pine forest with mist rolling between the trees.

Scene three: At the summit, the camera pans across a vast valley below.`;

async function main() {
  console.log("1. Checking tables...");
  for (const table of ["projects", "visual_assets", "job_queue"]) {
    const { error } = await admin.from(table).select("id").limit(1);
    console.log(`  ${table}:`, error ? `FAIL ${error.message}` : "OK");
  }

  console.log("\n2. Checking storage bucket...");
  const { data: buckets, error: bucketErr } = await admin.storage.listBuckets();
  const visualsBucket = buckets?.find((b) => b.name === "visuals");
  console.log("  visuals bucket:", bucketErr ? bucketErr.message : visualsBucket ? "OK" : "MISSING");

  console.log("\n3. Finding a user project...");
  const { data: projects } = await admin.from("projects").select("*").order("updated_at", { ascending: false }).limit(1);
  let project = projects?.[0];
  if (!project) {
    const { data: users } = await admin.auth.admin.listUsers({ perPage: 1 });
    const userId = users?.users?.[0]?.id;
    if (!userId) {
      console.error("No users in Supabase — sign up first.");
      process.exit(1);
    }
    const { data: created, error } = await admin
      .from("projects")
      .insert({ user_id: userId, title: "Visual test", script: TEST_SCRIPT, status: "in_progress" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    project = created;
    console.log("  Created test project", project.id);
  } else {
    await admin.from("projects").update({ script: TEST_SCRIPT }).eq("id", project.id);
    console.log("  Using project", project.id, "user", project.user_id);
  }

  console.log("\n4. Testing scene split (LLM)...");
  const { splitScriptIntoScenes } = await import("../lib/visuals/scene-split.ts");
  const scenes = await splitScriptIntoScenes(TEST_SCRIPT, 3);
  console.log("  Scenes:", scenes.length, scenes.map((s) => s.title));

  console.log("\n5. Inserting visual_assets...");
  await admin.from("visual_assets").delete().eq("project_id", project.id);
  const rows = scenes.map((scene, i) => ({
    project_id: project.id,
    scene_index: i,
    scene_title: scene.title,
    prompt: scene.prompt,
    type: "image",
    mode: "image",
    url: null,
  }));
  const { data: inserted, error: insertErr } = await admin.from("visual_assets").insert(rows).select("*");
  console.log("  insert:", insertErr ? insertErr.message : `OK ${inserted?.length} rows`);

  console.log("\n6. Testing Pollinations image...");
  const { generatePollinationsImage } = await import("../lib/providers/image.ts");
  const img = await generatePollinationsImage(scenes[0].prompt.slice(0, 100));
  console.log("  image bytes:", img.bytes.length, "url:", img.url.slice(0, 60) + "...");

  console.log("\n7. Testing persistSceneMedia...");
  const { persistSceneMedia } = await import("../lib/visuals/persist-image.ts");
  const supabaseUser = createClient(url, anonKey);
  const result = await persistSceneMedia(admin, project.user_id, project.id, 0, scenes[0].prompt.slice(0, 100), "image");
  console.log("  result url:", result.url ? result.url.slice(0, 80) : "EMPTY");

  if (inserted?.[0]) {
    const { error: updErr } = await admin
      .from("visual_assets")
      .update({ url: result.url, type: result.type, mode: result.mode })
      .eq("id", inserted[0].id);
    console.log("  asset update:", updErr ? updErr.message : "OK");
  }

  console.log("\nDone — pipeline core works if all steps show OK.");
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exit(1);
});
