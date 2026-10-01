import { downloadMedia, isRasterImage } from "@/lib/providers/media-bytes";
import { isProviderOpen, parkProvider } from "@/lib/providers/circuit";

/**
 * AI Horde — free community image generation (no paid key).
 * Anonymous key works; register at https://aihorde.net for better priority.
 */
const DEFAULT_BASE = "https://aihorde.net/api/v2";
const ANON_KEY = "0000000000";

function hordeBase() {
  return (process.env.AI_HORDE_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/$/, "");
}

function hordeKey() {
  return process.env.AI_HORDE_API_KEY?.trim() || ANON_KEY;
}

export function isAiHordeEnabled() {
  if (process.env.AI_HORDE_DISABLED === "true") return false;
  return isProviderOpen("ai-horde");
}

function models() {
  const configured = process.env.AI_HORDE_MODEL?.trim();
  // Prefer widely available SDXL workers; FLUX when the network has capacity.
  const defaults = ["SDXL 1.0", "stable_diffusion_xl", "FLUX.1-schnell"];
  return configured ? [configured, ...defaults.filter((m) => m !== configured)] : defaults;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function submitJob(prompt: string, seed: number): Promise<string | null> {
  const body = {
    prompt: `${prompt.trim().slice(0, 800)} ### blurry, low quality, text, watermark, logo`,
    nsfw: false,
    censor_nsfw: true,
    r2: true,
    shared: false,
    slow_workers: true,
    models: models(),
    params: {
      n: 1,
      width: 640,
      height: 384,
      steps: 12,
      cfg_scale: 7,
      sampler_name: "k_euler_a",
      seed: String(Math.abs(seed) % 2_147_483_647),
    },
  };

  const response = await fetch(`${hordeBase()}/generate/async`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: hordeKey(),
      "Client-Agent": "ReelForgeAI:1.0:github.com/utkarsh13200/ReelForge-AI",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  const text = await response.text();
  if (response.status === 401 || response.status === 403) {
    parkProvider("ai-horde", 30 * 60_000);
    return null;
  }
  if (response.status === 429) {
    parkProvider("ai-horde", 5 * 60_000);
    return null;
  }
  if (!response.ok) {
    // Try once more with any available model if the named models are offline.
    if (/model|maintenance|no.*worker/i.test(text)) {
      const fallback = await fetch(`${hordeBase()}/generate/async`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: hordeKey(),
          "Client-Agent": "ReelForgeAI:1.0:github.com/utkarsh13200/ReelForge-AI",
        },
        body: JSON.stringify({ ...body, models: [] }),
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
      const fallbackText = await fallback.text();
      if (!fallback.ok) return null;
      const parsed = JSON.parse(fallbackText) as { id?: string };
      return parsed.id ?? null;
    }
    return null;
  }

  const parsed = JSON.parse(text) as { id?: string };
  return parsed.id ?? null;
}

async function waitForImage(id: string, timeoutMs: number): Promise<Buffer | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const check = await fetch(`${hordeBase()}/generate/check/${id}`, {
      cache: "no-store",
      headers: {
        apikey: hordeKey(),
        "Client-Agent": "ReelForgeAI:1.0:github.com/utkarsh13200/ReelForge-AI",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!check.ok) {
      await sleep(1200);
      continue;
    }
    const status = (await check.json()) as {
      done?: boolean;
      faulted?: boolean;
      is_possible?: boolean;
    };
    if (status.faulted || status.is_possible === false) return null;
    if (status.done) {
      const full = await fetch(`${hordeBase()}/generate/status/${id}`, {
        cache: "no-store",
        headers: {
          apikey: hordeKey(),
          "Client-Agent": "ReelForgeAI:1.0:github.com/utkarsh13200/ReelForge-AI",
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (!full.ok) return null;
      const payload = (await full.json()) as {
        generations?: Array<{ img?: string; seed?: string }>;
      };
      const img = payload.generations?.[0]?.img;
      if (!img) return null;
      if (/^https?:\/\//i.test(img)) {
        const downloaded = await downloadMedia(img, 15_000);
        if (downloaded && isRasterImage(downloaded.bytes, downloaded.contentType)) {
          return downloaded.bytes;
        }
        return null;
      }
      // Some workers return base64 webp/png.
      const bytes = Buffer.from(img, "base64");
      if (isRasterImage(bytes, "image/webp") || isRasterImage(bytes, "image/png")) {
        return bytes;
      }
      return null;
    }
    await sleep(1400);
  }
  return null;
}

/** Free AI still via AI Horde. Bounded wait so the Visuals hot path cannot freeze. */
export async function fetchAiHordeImage(
  prompt: string,
  timeoutMs = 18_000,
  seed = Date.now()
): Promise<Buffer | null> {
  if (!isAiHordeEnabled()) return null;
  const clipped = prompt.trim();
  if (!clipped) return null;

  try {
    const id = await submitJob(clipped, seed);
    if (!id) return null;
    const remaining = Math.max(4_000, timeoutMs - 2_000);
    return await waitForImage(id, remaining);
  } catch {
    return null;
  }
}
