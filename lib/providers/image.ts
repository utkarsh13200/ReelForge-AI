import { fetchStockImage } from "@/lib/providers/stock-image";
import { fetchHuggingFaceImage } from "@/lib/providers/huggingface";
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

/** Public Pollinations stills; keep short so a stuck queue cannot freeze the job. */
export const IMAGE_FETCH_TIMEOUT_MS = Number(process.env.IMAGE_FETCH_TIMEOUT_MS) || 5_000;

function imageDimensions(ratio: ImageRatio) {
  return ratio === "16:9" ? { width: 768, height: 432 } : { width: 432, height: 768 };
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
  return `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&nologo=true&seed=${s}`;
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
): Promise<{ bytes: Buffer | null; retry: boolean }> {
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
    if (response.ok && isRasterImage(bytes, contentType)) {
      return { bytes, retry: false };
    }
    const body = bytes.toString("utf8").slice(0, 240);
    const queued = response.status === 402 || response.status === 429 || /queue full/i.test(body);
    return { bytes: null, retry: queued || response.status >= 500 };
  } catch {
    return { bytes: null, retry: true };
  }
}

export async function fetchPollinationsImage(
  prompt: string,
  seed: number,
  timeoutMs = IMAGE_FETCH_TIMEOUT_MS
): Promise<Buffer | null> {
  return withPollinationsLock(async () => {
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = await fetchPollinationsOnce(prompt, seed + attempt * 13, timeoutMs);
        if (result.bytes) return result.bytes;
        if (!result.retry) break;
        await sleep(400 * (attempt + 1));
      }
      return null;
    } finally {
      await sleep(80);
    }
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

/** Hugging Face stills in parallel; Pollinations stays sequential as backup. Skip Replicate (402). */
export async function fetchSceneImagesParallel(
  items: SceneImageRequest[]
): Promise<Array<Buffer | null>> {
  const stills: Array<Buffer | null> = items.map(() => null);

  if (isGeminiImageUsable()) {
    const gemini = await Promise.all(items.map((item) => fetchGeminiImage(item.prompt, 2_500)));
    gemini.forEach((bytes, index) => {
      stills[index] = bytes;
    });
  }

  const missing = items
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => !stills[index]?.length);

  if (missing.length) {
    const hf = await Promise.all(missing.map(({ item }) => fetchHuggingFaceImage(item.prompt, 8_000)));
    hf.forEach((bytes, i) => {
      if (bytes?.length) stills[missing[i].index] = bytes;
    });
  }

  for (let index = 0; index < items.length; index += 1) {
    if (stills[index]?.length) continue;
    const item = items[index];
    stills[index] =
      (await fetchPollinationsImage(item.prompt, item.seed, 5_000)) ??
      (await fetchStockImage(item.prompt, item.beat, 3_000, item.seed));
  }

  return stills;
}

export function describeImageProvider() {
  const gemini = getGeminiImageStatus();
  if (gemini.available && gemini.model) return `Gemini (${gemini.model})`;
  return "Gemini → Hugging Face → Pollinations (auto-fallback)";
}
