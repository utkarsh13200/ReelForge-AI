import { fetchStockImage } from "@/lib/providers/stock-image";
import { fetchHuggingFaceImage, isHuggingFaceConfigured } from "@/lib/providers/huggingface";
import { isProviderOpen } from "@/lib/providers/circuit";
import { fetchGeminiImage, isGeminiImageUsable } from "@/lib/providers/gemini-image";
import {
  fetchCloudflareAiImage,
  isCloudflareAiConfigured,
} from "@/lib/providers/cloudflare-ai";
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

/** Tight timeouts so a dead provider fails fast and the next one runs. */
const CLOUDFLARE_TIMEOUT_MS = Number(process.env.CLOUDFLARE_IMAGE_TIMEOUT_MS) || 12_000;
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_IMAGE_TIMEOUT_MS) || 6_000;
const HF_TIMEOUT_MS = Number(process.env.HF_IMAGE_TIMEOUT_MS) || 5_000;
const POLLINATIONS_TIMEOUT_MS = Number(process.env.IMAGE_FETCH_TIMEOUT_MS) || 8_000;
const STOCK_TIMEOUT_MS = 5_000;
const GEMINI_CONCURRENCY = Math.max(1, Number(process.env.GEMINI_IMAGE_CONCURRENCY) || 2);
const HF_CONCURRENCY = Math.max(1, Number(process.env.HF_IMAGE_CONCURRENCY) || 3);

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

async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
) {
  if (!items.length) return;
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

/**
 * Still generation order (fast path):
 * 1) Cloudflare FLUX (parallel)
 * 2) Gemini — all configured keys/models (bounded parallel)
 * 3) Hugging Face (bounded parallel)
 * 4) Pollinations (sequential, 1/IP)
 * 5) Wikimedia stock (last resort)
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

  const noteDone = (index: number, provider: string, bytes: Buffer) => {
    if (isUsableStill(stills[index]) || !isUsableStill(bytes)) return;
    writeCache(scenes[index].prompt, scenes[index].seed, bytes);
    stills[index] = bytes;
    void onProgress({ index, total, status: "done", provider });
  };

  const stillOpen = () => missing.filter((index) => !isUsableStill(stills[index]));

  // 1) Cloudflare first — parallel across scenes.
  if (isCloudflareAiConfigured()) {
    await Promise.all(
      stillOpen().map(async (index) => {
        const scene = scenes[index];
        const bytes = await fetchCloudflareAiImage(
          scene.prompt,
          CLOUDFLARE_TIMEOUT_MS,
          scene.seed
        );
        if (isUsableStill(bytes)) noteDone(index, "cloudflare-ai", bytes!);
      })
    );
  }

  // 2) Gemini next — rotates every GEMINI_API_KEY / _2 / _3 / GEMINI_API_KEYS.
  if (isGeminiImageUsable()) {
    await mapPool(stillOpen(), GEMINI_CONCURRENCY, async (index) => {
      if (!isGeminiImageUsable() || isUsableStill(stills[index])) return;
      const bytes = await fetchGeminiImage(scenes[index].prompt, GEMINI_TIMEOUT_MS);
      if (isUsableStill(bytes)) noteDone(index, "gemini", bytes!);
    });
  }

  // 3) Hugging Face for leftovers.
  if (isHuggingFaceConfigured() && isProviderOpen("hf")) {
    await mapPool(stillOpen(), HF_CONCURRENCY, async (index) => {
      if (!isProviderOpen("hf") || isUsableStill(stills[index])) return;
      const bytes = await fetchHuggingFaceImage(scenes[index].prompt, HF_TIMEOUT_MS);
      if (isUsableStill(bytes)) noteDone(index, "huggingface", bytes!);
    });
  }

  // 4) Pollinations — one request at a time (public IP queue).
  {
    let pollinationsQueueDead = false;
    for (const index of stillOpen()) {
      const scene = scenes[index];
      if (pollinationsQueueDead) break;

      const poll = await fetchPollinationsImageWithStatus(
        scene.prompt,
        scene.seed,
        POLLINATIONS_TIMEOUT_MS
      );
      if (isUsableStill(poll.bytes)) {
        noteDone(index, "pollinations", poll.bytes!);
        continue;
      }
      if (poll.queueDead) {
        await sleep(600);
        const retry = await fetchPollinationsImage(
          scene.prompt,
          scene.seed + 11,
          POLLINATIONS_TIMEOUT_MS,
          2
        );
        if (isUsableStill(retry)) {
          noteDone(index, "pollinations", retry);
          continue;
        }
        pollinationsQueueDead = true;
      }
    }
  }

  // 5) Wikimedia stock — last resort only.
  for (const index of stillOpen()) {
    const scene = scenes[index];
    const stock = await fetchStockImage(scene.prompt, scene.beat, STOCK_TIMEOUT_MS, scene.seed);
    if (isUsableStill(stock)) {
      noteDone(index, "stock", stock);
      continue;
    }
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

  return stills;
}

/** Used by assemble-video for image/motion modes. */
export async function fetchSceneStillsFast(
  items: SceneImageRequest[],
  options?: GenerateImagesOptions
): Promise<Array<Buffer | null>> {
  return generateImagesForScript(items, options);
}
