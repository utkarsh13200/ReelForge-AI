/**
 * Apply migration 004 if columns are missing. Run:
 * npx tsx --env-file=.env.local scripts/apply-migration-004.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

async function columnMissing(table, column) {
  const { error } = await admin.from(table).select(column).limit(1);
  return Boolean(error?.message?.includes(column) || error?.message?.includes("schema cache"));
}

async function main() {
  const needProject = await columnMissing("projects", "visual_video_url");
  const needBeat = await columnMissing("visual_assets", "scene_beat");

  if (!needProject && !needBeat) {
    console.log("Migration 004 already applied.");
    return;
  }

  console.log(`
Run this SQL in Supabase → SQL Editor:

alter table public.projects
  add column if not exists visual_video_url text,
  add column if not exists visual_video_duration_seconds numeric;

alter table public.visual_assets
  add column if not exists scene_beat text;
`);
  process.exit(needProject || needBeat ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
