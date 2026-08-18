import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: assets } = await admin
  .from("visual_assets")
  .select("scene_index, url")
  .eq("project_id", "08ff30ad-ee0f-42d8-9885-b175cfdec46d")
  .order("scene_index")
  .limit(3);

for (const a of assets ?? []) {
  console.log("scene", a.scene_index + 1, a.url?.slice(0, 120));
  if (a.url) {
    const r = await fetch(a.url, { signal: AbortSignal.timeout(15000) });
    console.log("  fetch:", r.status, r.headers.get("content-type"));
  }
}
