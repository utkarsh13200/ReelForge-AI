import { fal } from "@fal-ai/client";
import { parkProvider, shouldParkProvider } from "@/lib/providers/circuit";

export type FalAspectRatio = "16:9" | "9:16";

export type FalVideoResult = {
  url: string;
  bytes: Buffer;
};

function falKey() {
  return process.env.FAL_KEY?.trim() || process.env.FAL_API_KEY?.trim() || "";
}

export function isFalConfigured() {
  return Boolean(falKey());
}

function configureFal() {
  const key = falKey();
  if (!key) {
    throw new Error("Fal.ai is not configured.");
  }
  fal.config({ credentials: key });
}

function falModel() {
  return process.env.FAL_VIDEO_MODEL?.trim() || "fal-ai/hunyuan-video";
}

function extractVideoUrl(data: unknown): string | null {
  const root = data as {
    video?: { url?: string };
    video_url?: string;
    url?: string;
  };
  return root.video?.url || root.video_url || root.url || null;
}

export async function generateFalTextToVideo(input: {
  prompt: string;
  aspectRatio?: FalAspectRatio;
  seed?: number;
}): Promise<FalVideoResult> {
  configureFal();

  const prompt = input.prompt.trim().slice(0, 800);
  if (!prompt) throw new Error("A text prompt is required to generate video.");

  try {
    const result = await fal.subscribe(falModel(), {
      input: {
        prompt,
        aspect_ratio: input.aspectRatio ?? "16:9",
        resolution: process.env.FAL_VIDEO_RESOLUTION?.trim() || "480p",
        num_frames: Number(process.env.FAL_VIDEO_NUM_FRAMES) || 85,
        pro_mode: false,
        ...(typeof input.seed === "number" ? { seed: input.seed } : {}),
      },
    });

    const videoUrl = extractVideoUrl(result.data);
    if (!videoUrl) {
      throw new Error("Fal.ai finished but did not return a video URL. Try a shorter scene prompt.");
    }

    const response = await fetch(videoUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Could not download the Fal.ai video (HTTP ${response.status}).`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1000) {
      throw new Error("Fal.ai returned an empty video file.");
    }

    return { url: videoUrl, bytes };
  } catch (caught) {
    const err = caught as { status?: number; message?: string; body?: unknown };
    const body = typeof err.body === "string" ? err.body : JSON.stringify(err.body ?? "");
    if (shouldParkProvider(err.status, `${err.message ?? ""} ${body}`)) {
      parkProvider("fal");
    }
    throw caught;
  }
}

export type SceneVideoRequest = {
  prompt: string;
  seed: number;
  beat?: string | null;
};

/** One Hunyuan clip per scene. Sequential so free-tier credits and GPU queue stay stable. */
export async function fetchFalSceneVideos(
  items: SceneVideoRequest[],
  aspectRatio: FalAspectRatio = "16:9"
): Promise<Array<Buffer | null>> {
  const clips: Array<Buffer | null> = [];
  for (const item of items) {
    const prompt = item.beat?.trim()
      ? `Cinematic 16:9 video, no text overlay: ${item.beat.trim().slice(0, 400)}`
      : item.prompt;
    try {
      const generated = await generateFalTextToVideo({
        prompt,
        aspectRatio,
        seed: item.seed,
      });
      clips.push(generated.bytes);
    } catch {
      clips.push(null);
    }
  }
  return clips;
}
