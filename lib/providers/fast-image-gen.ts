import { fetchStockImage } from "@/lib/providers/stock-image";
import { fetchHuggingFaceImage, isHuggingFaceConfigured } from "@/lib/providers/huggingface";
import { isProviderOpen } from "@/lib/providers/circuit";
import { fetchGeminiImage, isGeminiImageUsable } from "@/lib/providers/gemini-image";
import {
  fetchPollinationsImage,
  fetchPollinationsImageWithStatus,
} from "@/lib/providers/image";
import { isUsableStill } from "@/lib/visuals/visuals-storage";

export type SceneImageRequest = {
  prompt: string;
  seed: number;
  beat?: string | null;
};

export type ImageGenProgressEvent = {
  index: number;
  total: number;
  status: "done" | "failed" | "cached";
  provider?: string;
  error?: string;
};

export type GenerateImagesOptions = {
  concurrency?: number;
  retries?: number;
  timeoutMs?: number;
  onProgress?: (event: ImageGenProgressEvent) => void | Promise<void>;
};

const HF_TIMEOUT_MS = Number(process.env.HF_IMAGE_TIMEOUT_MS) || 4_000;
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_IMAGE_TIMEOUT_MS) || 5_000;
const POLLINATIONS_TIMEOUT_MS = Number(process.env.IMAGE_FETCH_TIMEOUT_MS) || 8_000;
const STOCK_TIMEOUT_MS = 6_000;

const memoryCache = new Map<string, Buffer>();

function cacheKey(prompt: string, seed: number) {
  return `${seed}:${prompt.trim().slice(0, 240)}`;
}

function readCache(prompt: string, seed: number) {
  return memoryCache.get(cacheKey(prompt, seed)) ?? null;
}

function writeCache(prompt: string, seed: number, bytes: Buffer) {
  memoryCache.set(cacheKey(prompt, seed), bytes);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fast image generation for 5-scene production.
 * HF/Gemini run in parallel while Pollinations (locked, 1/IP) walks scenes —
 * overlap keeps total time low without queue collisions.
 */
export async function generateImagesForScript(
  scenes: SceneImageRequest[],
  options: GenerateImagesOptions = {}
): Promise<Array<Buffer | null>> {
  const onProgress = options.onProgress ?? (() => {});
  const total = scenes.length;
  const stills: Array<Buffer | null> = scenes.map(() => null);
  const missing: number[] = [];

  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const cached = readCache(scene.prompt, scene.seed);
    if (isUsableStill(cached)) {
      stills[index] = cached;
      void onProgress({ index, total, status: "cached", provider: "cache" });
    } else {
      missing.push(index);
    }
  }

  if (!missing.length) return stills;

  const hfReady = isHuggingFaceConfigured() && isProviderOpen("hf");
  const geminiReady = isGeminiImageUsable();

  const noteDone = (index: number, provider: string, bytes: Buffer) => {
    if (isUsableStill(stills[index]) || !isUsableStill(bytes)) return;
    writeCache(scenes[index].prompt, scenes[index].seed, bytes);
    stills[index] = bytes;
    void onProgress({ index, total, status: "done", provider });
  };

  // One probe each for paid keys. Quota/credit failures park the provider
  // so we do not burn 5 scenes on 429/402/403.
  const first = missing[0];
  if (first != null && geminiReady) {
    const bytes = await fetchGeminiImage(scenes[first].prompt, GEMINI_TIMEOUT_MS);
    if (isUsableStill(bytes)) noteDone(first, "gemini", bytes);
  }
  if (first != null && !isUsableStill(stills[first]) && hfReady && isProviderOpen("hf")) {
    const bytes = await fetchHuggingFaceImage(scenes[first].prompt, HF_TIMEOUT_MS);
    if (isUsableStill(bytes)) noteDone(first, "huggingface", bytes);
  }

  let pollinationsQueueDead = false;
  for (const index of missing) {
    if (isUsableStill(stills[index])) continue;
    const scene = scenes[index];

    if (!pollinationsQueueDead) {
      const poll = await fetchPollinationsImageWithStatus(
        scene.prompt,
        scene.seed,
        POLLINATIONS_TIMEOUT_MS
      );
      if (isUsableStill(poll.bytes)) {
        noteDone(index, "pollinations", poll.bytes);
        continue;
      }
      if (poll.queueDead) {
        await sleep(800);
        const retryPoll = await fetchPollinationsImage(
          scene.prompt,
          scene.seed + 11,
          POLLINATIONS_TIMEOUT_MS,
          2
        );
        if (isUsableStill(retryPoll)) {
          noteDone(index, "pollinations", retryPoll);
          continue;
        }
        pollinationsQueueDead = true;
      }
    }

    const stock = await fetchStockImage(scene.prompt, scene.beat, STOCK_TIMEOUT_MS, scene.seed);
    if (isUsableStill(stock)) {
      noteDone(index, "stock", stock);
    }
  }

  for (const index of missing) {
    if (isUsableStill(stills[index])) continue;
    const scene = scenes[index];
    const stock = await fetchStockImage(scene.prompt, scene.beat, STOCK_TIMEOUT_MS, scene.seed + 73);
    if (isUsableStill(stock)) {
      noteDone(index, "stock-retry", stock);
    } else {
      const generic = await fetchStockImage(
        "cinematic documentary photograph wide landscape",
        scene.beat,
        STOCK_TIMEOUT_MS,
        scene.seed + 91
      );
      if (isUsableStill(generic)) {
        noteDone(index, "stock", generic);
      } else {
        void onProgress({ index, total, status: "failed", error: "All providers failed" });
      }
    }
  }
  return stills;
}

/** Used by assemble-video for image/motion modes. */
export async function fetchSceneStillsFast(
  items: SceneImageRequest[],
  options?: GenerateImagesOptions
): Promise<Array<Buffer | null>> {
  return generateImagesForScript(items, options);
}
