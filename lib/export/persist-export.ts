import type { SupabaseClient } from "@supabase/supabase-js";

export async function uploadExportVideo(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  exportJobId: string,
  video: Buffer
) {
  const path = `${userId}/${projectId}/export-${exportJobId}.mp4`;
  const { error } = await supabase.storage.from("exports").upload(path, new Uint8Array(video), {
    contentType: "video/mp4",
    upsert: true,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("exports").getPublicUrl(path);
  return data.publicUrl;
}
