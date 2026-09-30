import type { SupabaseClient } from "@supabase/supabase-js";
import type { WordTimestamp } from "@/lib/types/voice";

export async function uploadVoiceChunk(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  chunkIndex: number,
  audio: Buffer
) {
  const path = `${userId}/${projectId}/chunks/${chunkIndex}.mp3`;
  const { error } = await supabase.storage.from("voice").upload(path, audio, {
    contentType: "audio/mpeg",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function uploadFinalVoiceover(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  audio: Buffer
) {
  const path = `${userId}/${projectId}/voiceover-${Date.now()}.mp3`;
  const { error } = await supabase.storage.from("voice").upload(path, audio, {
    contentType: "audio/mpeg",
    upsert: true,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("voice").getPublicUrl(path);
  return { path, url: data.publicUrl };
}

export async function downloadVoiceChunks(
  supabase: SupabaseClient,
  chunkPaths: string[]
): Promise<Buffer[]> {
  const buffers: Buffer[] = [];

  for (const path of chunkPaths) {
    const { data, error } = await supabase.storage.from("voice").download(path);
    if (error || !data) throw new Error(error?.message || `Could not download chunk ${path}.`);
    buffers.push(Buffer.from(await data.arrayBuffer()));
  }

  return buffers;
}

export async function saveVoiceAsset(
  supabase: SupabaseClient,
  projectId: string,
  voiceId: string,
  audioUrl: string,
  durationSeconds: number,
  wordTimestamps: WordTimestamp[]
) {
  await supabase.from("voice_assets").delete().eq("project_id", projectId);

  const { data, error } = await supabase
    .from("voice_assets")
    .insert({
      project_id: projectId,
      audio_url: audioUrl,
      voice_id: voiceId,
      duration_seconds: durationSeconds,
      word_timestamps_json: wordTimestamps,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}
