import { generateComfyTextToVideo, isComfyUiConfigured } from "@/lib/providers/comfyui";
import { generateFalTextToVideo, isFalConfigured } from "@/lib/providers/fal-video";
import { fetchHuggingFaceVideo, isHuggingFaceConfigured } from "@/lib/providers/huggingface";
import { fetchReplicateVideo, isReplicateConfigured } from "@/lib/providers/replicate";
import { isProviderOpen, parkProvider } from "@/lib/providers/circuit";

export type SceneVideoRequest = {
  prompt: string;
  seed: number;
  beat?: string | null;
};

function clipPrompt(item: SceneVideoRequest) {
  const beat = item.beat?.trim();
  if (beat) return `Cinematic 16:9 video, no text overlay: ${beat.slice(0, 400)}`;
  return item.prompt.trim().slice(0, 500);
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function tryFal(item: SceneVideoRequest) {
  if (!isFalConfigured() || !isProviderOpen("fal")) return null;
  try {
    const bytes = await withTimeout(
      generateFalTextToVideo({ prompt: clipPrompt(item), seed: item.seed }).then((result) => result.bytes),
      3_000
    );
    if (bytes?.length) return bytes;
  } catch {
    // 402/403 parks inside generateFalTextToVideo
  }
  parkProvider("fal");
  return null;
}

async function tryReplicate(item: SceneVideoRequest) {
  if (!isReplicateConfigured() || !isProviderOpen("replicate")) return null;
  return fetchReplicateVideo(clipPrompt(item), 2_000);
}

async function tryHuggingFace(item: SceneVideoRequest) {
  if (!isHuggingFaceConfigured() || !isProviderOpen("hf-video")) return null;
  return fetchHuggingFaceVideo(clipPrompt(item), 8_000);
}

async function tryComfy(item: SceneVideoRequest, imageBytes?: Buffer | null) {
  if (!isComfyUiConfigured()) return null;
  try {
    if (imageBytes?.length) {
      const { generateComfyImageToVideo } = await import("@/lib/providers/comfyui");
      const i2v = await generateComfyImageToVideo(imageBytes, item.seed);
      if (i2v) return i2v;
    }
    return await generateComfyTextToVideo(clipPrompt(item), item.seed);
  } catch {
    return null;
  }
}

/** Fal → Replicate → Hugging Face → ComfyUI. First miss parks T2V for the rest of the job. */
export async function fetchSceneVideosWithFallback(
  items: SceneVideoRequest[],
  stills: Array<Buffer | null> = []
): Promise<Array<Buffer | null>> {
  const clips: Array<Buffer | null> = items.map(() => null);
  let t2vAvailable = true;

  for (let index = 0; index < items.length; index += 1) {
    if (!t2vAvailable) continue;
    const bytes =
      (await tryFal(items[index])) ??
      (await tryReplicate(items[index])) ??
      (await tryHuggingFace(items[index])) ??
      (await tryComfy(items[index], stills[index]));
    if (bytes?.length) {
      clips[index] = bytes;
    } else {
      t2vAvailable = false;
    }
  }

  return clips;
}

export async function generateSceneVideo(
  prompt: string,
  seed: number,
  beat?: string | null
): Promise<Buffer | null> {
  const [clip] = await fetchSceneVideosWithFallback([{ prompt, seed, beat }]);
  return clip;
}
