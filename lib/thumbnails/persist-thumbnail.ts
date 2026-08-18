import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSceneImage } from "@/lib/providers/image";
import { createAdminClient } from "@/lib/supabase/admin";

function sniffImageType(bytes: Buffer): { contentType: string; ext: string } {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { contentType: "image/jpeg", ext: "jpg" };
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { contentType: "image/png", ext: "png" };
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return { contentType: "image/webp", ext: "webp" };
  return { contentType: "image/jpeg", ext: "jpg" };
}

export async function persistThumbnailCandidateFromBytes(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  prompt: string,
  index: number,
  headline: string,
  bytes: Buffer
) {
  if (bytes.length < 800) {
    throw new Error(`Could not save thumbnail candidate ${index + 1}.`);
  }

  const { contentType, ext } = sniffImageType(bytes);
  const path = `${userId}/${projectId}/candidate-${index}-${Date.now()}.${ext}`;
  const storageClient = createAdminClient() ?? supabase;
  const { error: uploadError } = await storageClient.storage.from("thumbnails").upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicData } = storageClient.storage.from("thumbnails").getPublicUrl(path);

  const { data, error } = await supabase
    .from("thumbnails")
    .insert({
      project_id: projectId,
      url: publicData.publicUrl,
      prompt,
      headline,
      is_selected: false,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function persistThumbnailCandidate(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  prompt: string,
  index: number,
  headline: string
) {
  const bytes = await fetchSceneImage(prompt, 200 + index, headline);
  if (!bytes) {
    throw new Error(`Could not generate thumbnail candidate ${index + 1}.`);
  }
  return persistThumbnailCandidateFromBytes(
    supabase,
    userId,
    projectId,
    prompt,
    index,
    headline,
    bytes
  );
}

export async function persistFinalThumbnail(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  thumbnailId: string,
  pngBytes: Buffer
) {
  const path = `${userId}/${projectId}/final-${thumbnailId}-${Date.now()}.png`;
  const storageClient = createAdminClient() ?? supabase;
  const { error: uploadError } = await storageClient.storage.from("thumbnails").upload(path, pngBytes, {
    contentType: "image/png",
    upsert: true,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicData } = storageClient.storage.from("thumbnails").getPublicUrl(path);
  const finalUrl = publicData.publicUrl;

  await supabase.from("thumbnails").update({ is_selected: false }).eq("project_id", projectId);

  const { data, error } = await supabase
    .from("thumbnails")
    .update({
      url: finalUrl,
      is_selected: true,
    })
    .eq("id", thumbnailId)
    .eq("project_id", projectId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}
