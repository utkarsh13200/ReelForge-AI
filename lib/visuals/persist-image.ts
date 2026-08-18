import type { SupabaseClient } from "@supabase/supabase-js";
import { generateSceneVideo } from "@/lib/providers/scene-video";
import { fetchSceneImage } from "@/lib/providers/image";
import { createKenBurnsVideo } from "@/lib/visuals/ken-burns-video";
import { buildSceneImagePrompt } from "@/lib/visuals/prompt";
import type { VisualAsset, VisualMode } from "@/lib/types/visual";
import { createAdminClient } from "@/lib/supabase/admin";

export async function persistSceneMedia(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  sceneIndex: number,
  prompt: string,
  mode: VisualMode,
  beat?: string | null
) {
  const scriptPrompt = beat?.trim() ? buildSceneImagePrompt(beat) : prompt;
  const admin = createAdminClient() ?? supabase;
  let stillBytes: Buffer | null = null;

  if (mode === "video") {
    const videoPrompt = beat?.trim()
      ? `Cinematic 16:9 video, no text overlay: ${beat.trim().slice(0, 400)}`
      : scriptPrompt;

    const videoBytes = await generateSceneVideo(videoPrompt, sceneIndex + 1, beat);
    stillBytes = videoBytes?.length ? null : await fetchSceneImage(scriptPrompt, sceneIndex + 1, beat);
    const motionBytes =
      videoBytes?.length
        ? videoBytes
        : stillBytes?.length
          ? await createKenBurnsVideo(stillBytes, 5).catch(() => null)
          : null;

    if (motionBytes?.length) {
      const storagePath = `${userId}/${projectId}/scene-${sceneIndex}-${Date.now()}.mp4`;
      const { error } = await admin.storage.from("visuals").upload(storagePath, motionBytes, {
        contentType: "video/mp4",
        upsert: true,
      });
      if (error) throw new Error(error.message);
      return {
        url: admin.storage.from("visuals").getPublicUrl(storagePath).data.publicUrl,
        type: "video" as const,
        mode: "video" as const,
      };
    }
  }

  const bytes = stillBytes ?? (await fetchSceneImage(scriptPrompt, sceneIndex + 1, beat));
  if (!bytes) {
    throw new Error("Could not generate a scene image. Try again in a moment.");
  }

  const storagePath = `${userId}/${projectId}/scene-${sceneIndex}-${Date.now()}.jpg`;
  const { error } = await admin.storage.from("visuals").upload(storagePath, bytes, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw new Error(error.message);

  const url = admin.storage.from("visuals").getPublicUrl(storagePath).data.publicUrl;
  return {
    url,
    type: "image" as const,
    mode,
  };
}

export function sceneImagePrompt(asset: VisualAsset): string {
  const beat = asset.scene_beat?.trim() || asset.prompt?.trim() || "cinematic scene";
  return buildSceneImagePrompt(beat, asset.scene_title ?? undefined);
}

export const persistGeneratedImage = persistSceneMedia;
