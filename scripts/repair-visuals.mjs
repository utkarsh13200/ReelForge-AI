/**
 * Fill missing visual asset URLs for the latest project. Run:
 * node --env-file=.env.local scripts/repair-visuals.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main() {
  const { data: projects } = await admin
    .from("projects")
    .select("id, user_id, title")
    .order("updated_at", { ascending: false })
    .limit(1);

  const project = projects?.[0];
  if (!project) {
    console.error("No projects found");
    process.exit(1);
  }

  console.log("Project:", project.id, project.title);

  const { data: assets, error } = await admin
    .from("visual_assets")
    .select("*")
    .eq("project_id", project.id)
    .order("scene_index", { ascending: true });

  if (error) throw new Error(error.message);

  const missing = (assets ?? []).filter((a) => !a.url);
  console.log(`Assets: ${assets?.length ?? 0}, missing URLs: ${missing.length}`);

  if (!missing.length) {
    console.log("All assets have URLs.");
    return;
  }

  const { persistSceneMedia } = await import("../lib/visuals/persist-image.ts");

  for (const asset of missing) {
    const prompt = asset.prompt?.trim();
    if (!prompt) {
      console.log(`Scene ${asset.scene_index + 1}: skip (no prompt)`);
      continue;
    }

    process.stdout.write(`Scene ${asset.scene_index + 1}: generating… `);
    try {
      const mode = asset.mode || "image";
      const generated = await persistSceneMedia(
        admin,
        project.user_id,
        project.id,
        asset.scene_index,
        prompt,
        mode
      );

      let updatePayload = {
        url: generated.url,
        type: generated.type,
        mode: generated.mode,
      };

      let { error: updErr } = await admin.from("visual_assets").update(updatePayload).eq("id", asset.id);

      if (updErr && generated.mode === "video") {
        ({ error: updErr } = await admin
          .from("visual_assets")
          .update({ ...updatePayload, mode: "motion" })
          .eq("id", asset.id));
      }

      if (updErr) {
        ({ error: updErr } = await admin
          .from("visual_assets")
          .update({ url: generated.url, type: "image" })
          .eq("id", asset.id));
      }

      if (updErr) {
        console.log("FAIL", updErr.message);
      } else {
        console.log("OK", generated.url.slice(0, 70) + "…");
      }
    } catch (e) {
      console.log("FAIL", e instanceof Error ? e.message : e);
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
