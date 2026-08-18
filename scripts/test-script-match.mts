/**
 * Prove whether scene stills match a NEW script (not the pyramids one).
 * Saves stills to scripts/script-match-check/
 */
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { splitScriptIntoScenes } from "../lib/visuals/scene-split";
import { fetchSceneImagesParallel } from "../lib/providers/image";
import { sceneImagePrompt } from "../lib/visuals/persist-image";
import { computeScenePlan } from "../lib/visuals/scene-count";

const TOKYO = `Shibuya Crossing, Tokyo, 2024. Night rain turns the neon signs into rivers of pink and blue light on the wet asphalt.

Thousands of umbrellas surge across the scramble as a train rattles over the station. A street vendor under a yellow awning serves steaming ramen to night-shift workers.

High above, a giant digital billboard plays a silent anime clip while taxis wait at the curb, their red taillights reflecting in every puddle.`;

const outDir = join("scripts", "script-match-check");
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const plan = computeScenePlan(TOKYO, "motion");
const scenes = await splitScriptIntoScenes(TOKYO, "motion");
console.log("plan scenes:", plan.sceneCount, "split:", scenes.length);

const requests = scenes.map((scene, i) => ({
  prompt: sceneImagePrompt({
    id: String(i),
    project_id: "test",
    type: "image" as const,
    prompt: scene.prompt,
    url: null,
    scene_index: i,
    scene_title: scene.title,
    scene_beat: scene.beat,
    mode: "motion" as const,
    created_at: "",
  }),
  seed: i + 100,
  beat: scene.beat,
}));

for (let i = 0; i < scenes.length; i += 1) {
  console.log(`\nSCENE ${i + 1}`);
  console.log("  title:", scenes[i].title);
  console.log("  beat:", scenes[i].beat.slice(0, 140));
  console.log("  prompt:", requests[i].prompt.slice(0, 180));
}

const started = Date.now();
const stills = await fetchSceneImagesParallel(requests);
console.log("\nTOTAL parallel fetch", Date.now() - started, "ms");

let failed = 0;
for (let i = 0; i < stills.length; i += 1) {
  const bytes = stills[i];
  console.log(`scene ${i + 1}: ${bytes ? bytes.length + " bytes" : "NULL"}`);
  if (!bytes) {
    failed += 1;
    continue;
  }
  await writeFile(join(outDir, `scene-${i + 1}.jpg`), new Uint8Array(bytes));
}

if (failed) {
  console.error(`FAILED: ${failed}/${stills.length} scenes returned no image`);
  process.exit(1);
}
console.log("saved to", outDir);
