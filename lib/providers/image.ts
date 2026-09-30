import { fetchStockImage } from "@/lib/providers/stock-image";
import { fetchHuggingFaceImage, isHuggingFaceConfigured } from "@/lib/providers/huggingface";
import { isProviderOpen } from "@/lib/providers/circuit";
import {
  fetchGeminiImage,
  getGeminiImageConfig,
  getGeminiImageStatus,
  isGeminiImageConfigured,
  isGeminiImageUsable,
} from "@/lib/providers/gemini-image";

export { isGeminiImageConfigured, isGeminiImageUsable, getGeminiImageConfig, getGeminiImageStatus };

export type ImageRatio = "16:9" | "9:16";

export type ImageProvider = "gemini" | "pollinations-link" | "stock";

export type GeneratedImage = {
  url: string;
  bytes: Buffer | null;
  provider: ImageProvider;
};

/** All production scenes must use script-matched AI stills before stock fallback. */
export const MIN_SCRIPT_MATCHED_AI_SCENES = 5;

/** Public Pollinations stills; keep short so a stuck queue cannot freeze the job. */
export const IMAGE_FETCH_TIMEOUT_MS = Number(process.env.IMAGE_FETCH_TIMEOUT_MS) || 8_000;

const HF_PARALLEL_TIMEOUT_MS = Number(process.env.HF_IMAGE_TIMEOUT_MS) || 2_500;
const POLLINATIONS_TAIL_TIMEOUT_MS = 2_400;
const STOCK_TIMEOUT_MS = 2_500;

const sceneImageCache = new Map<string, Buffer>();

function sceneCacheKey(prompt: string, seed: number) {
  return `${seed}:${prompt.trim().slice(0, 240)}`;
}

function imageDimensions(ratio: ImageRatio) {
  return ratio === "16:9" ? { width: 640, height: 360 } : { width: 360, height: 640 };
}

export function getActiveImageProvider(): ImageProvider {
  if (isGeminiImageUsable()) return "gemini";
  return "pollinations-link";
}

export function buildPollinationsUrl(
  prompt: string,
  ratio: ImageRatio = "16:9",
  seed?: number
) {
  const { width, height } = imageDimensions(ratio);
  const safePrompt = prompt.trim().slice(0, 320);
  const encoded = encodeURIComponent(safePrompt);
  const s = seed ?? Date.now();
  // Do not pass model=flux — the public endpoint queues one request per IP and
  // flux stalls. Default Sana Sprint returns a JPEG in a few seconds.
  const token =
    process.env.IMAGE_GEN_API_KEY?.trim() ||
    process.env.POLLINATIONS_API_KEY?.trim() ||
    "";
  const keyQuery = token ? `&token=${encodeURIComponent(token)}` : "";
  return `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&nologo=true&seed=${s}${keyQuery}`;
}

function isRasterImage(bytes: Buffer, contentType: string | null) {
  if (bytes.length < 800) return false;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return true;
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return true;
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return true;
  return Boolean(contentType?.startsWith("image/"));
}

/** Public Pollinations allows only one in-flight image per IP. */
let pollinationsLock: Promise<unknown> = Promise.resolve();

function withPollinationsLock<T>(task: () => Promise<T>): Promise<T> {
  const run = pollinationsLock.then(task, task);
  pollinationsLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function generatePollinationsImage(
  prompt: string,
  ratio: ImageRatio = "16:9",
  seed?: number
): GeneratedImage {
  return { url: buildPollinationsUrl(prompt, ratio, seed), bytes: null, provider: "pollinations-link" };
}

export function generateSceneImage(
  prompt: string,
  ratio: ImageRatio = "16:9",
  seed?: number
): GeneratedImage {
  if (isGeminiImageUsable()) {
    return { url: "", bytes: null, provider: "gemini" };
  }
  return generatePollinationsImage(prompt, ratio, seed);
}

async function fetchPollinationsOnce(
  prompt: string,
  seed: number,
  timeoutMs: number
): Promise<{ bytes: Buffer | null; retry: boolean; queued: boolean }> {
  const url = buildPollinationsUrl(prompt, "16:9", seed);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": "ReelForgeAI/1.0",
        Accept: "image/jpeg,image/png,image/*,*/*",
      },
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type");
    if (response.ok && isRasterImage(bytes, contentType) && bytes.length >= 8_000) {
      return { bytes, retry: false, queued: false };
    }
    const body = bytes.toString("utf8").slice(0, 240);
    const queued = response.status === 402 || response.status === 429 || /queue full/i.test(body);
    return { bytes: null, retry: queued || response.status >= 500, queued };
  } catch {
    return { bytes: null, retry: true, queued: false };
  }
}

export async function fetchPollinationsImage(
  prompt: string,
  seed: number,
  timeoutMs = IMAGE_FETCH_TIMEOUT_MS,
  maxAttempts = 2
): Promise<Buffer | null> {
  const cached = sceneImageCache.get(sceneCacheKey(prompt, seed));
  if (cached?.length) return cached;

  return withPollinationsLock(async () => {
    const hit = sceneImageCache.get(sceneCacheKey(prompt, seed));
    if (hit?.length) return hit;

    try {
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const result = await fetchPollinationsOnce(prompt, seed + attempt * 17, timeoutMs);
        if (result.bytes?.length) {
          sceneImageCache.set(sceneCacheKey(prompt, seed), result.bytes);
          return result.bytes;
        }
        if (!result.retry) break;
        if (attempt + 1 < maxAttempts) await sleep(350 * (attempt + 1));
      }
      return null;
    } finally {
      await sleep(0);
    }
  });
}

/** Returns whether Pollinations queue appears full (skip further sequential calls). */
export async function fetchPollinationsImageWithStatus(
  prompt: string,
  seed: number,
  timeoutMs = IMAGE_FETCH_TIMEOUT_MS
): Promise<{ bytes: Buffer | null; queueDead: boolean }> {
  const cached = sceneImageCache.get(sceneCacheKey(prompt, seed));
  if (cached?.length) return { bytes: cached, queueDead: false };

  return withPollinationsLock(async () => {
    const hit = sceneImageCache.get(sceneCacheKey(prompt, seed));
    if (hit?.length) return { bytes: hit, queueDead: false };

    const result = await fetchPollinationsOnce(prompt, seed, timeoutMs);
    if (result.bytes?.length) {
      sceneImageCache.set(sceneCacheKey(prompt, seed), result.bytes);
      return { bytes: result.bytes, queueDead: false };
    }
    return { bytes: null, queueDead: result.queued };
  });
}

export async function fetchSceneImage(
  prompt: string,
  seed: number,
  beat?: string | null
): Promise<Buffer | null> {
  if (isGeminiImageUsable()) {
    const gemini = await fetchGeminiImage(prompt, IMAGE_FETCH_TIMEOUT_MS);
    if (gemini) return gemini;
  }

  const huggingface = await fetchHuggingFaceImage(prompt, 8_000);
  if (huggingface) return huggingface;

  const generated = await fetchPollinationsImage(prompt, seed, IMAGE_FETCH_TIMEOUT_MS);
  if (generated) return generated;

  return fetchStockImage(prompt, beat, 6_000, seed);
}

export type SceneImageRequest = {
  prompt: string;
  seed: number;
  beat?: string | null;
};

/** Hugging Face in parallel; Pollinations sequential backup overlaps HF wait per scene. */
export async function fetchSceneImagesParallel(
  items: SceneImageRequest[]
): Promise<Array<Buffer | null>> {
  const stills: Array<Buffer | null> = items.map(() => null);
  const hfReady = isHuggingFaceConfigured() && isProviderOpen("hf");

  const hfJobs = items.map((item, index) =>
    (async () => {
      if (!hfReady) return;
      const bytes = await fetchHuggingFaceImage(item.prompt, HF_PARALLEL_TIMEOUT_MS);
      if (bytes?.length) stills[index] = bytes;
    })()
  );

  const pollJob = (async () => {
    for (let index = 0; index < items.length; index += 1) {
      if (stills[index]?.length) continue;
      const item = items[index];

      if (hfReady) {
        await Promise.race([hfJobs[index], sleep(150)]);
      }
      if (stills[index]?.length) continue;

      stills[index] =
        (await fetchPollinationsImage(item.prompt, item.seed, POLLINATIONS_TAIL_TIMEOUT_MS, 2)) ??
        (await fetchStockImage(item.prompt, item.beat, STOCK_TIMEOUT_MS, item.seed));
    }
  })();

  await Promise.all([...hfJobs, pollJob]);
  return stills;
}

export function describeImageProvider() {
  const gemini = getGeminiImageStatus();
  if (gemini.available && gemini.model) return `Gemini (${gemini.model}) → Pollinations`;
  return "Pollinations (Gemini/HF used only when their image quota is active)";
}
