import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export async function uploadExportVideo(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  exportJobId: string,
  video: Buffer
) {
  const path = `${userId}/${projectId}/export-${exportJobId}.mp4`;
  const storageClient = createAdminClient() ?? supabase;
  const { error } = await storageClient.storage.from("exports").upload(path, new Uint8Array(video), {
    contentType: "video/mp4",
    upsert: true,
  });
  if (error) throw new Error(error.message);

  const { data } = storageClient.storage.from("exports").getPublicUrl(path);
  return data.publicUrl;
}
