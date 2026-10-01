export type GeminiImageConfig = {
  apiKey: string;
  model: string;
  baseUrl: string;
};

export type GeminiImageStatus = {
  configured: boolean;
  model: string | null;
  available: boolean;
  lastError: string | null;
  cooldownRemainingMs: number;
};

const DEFAULT_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-lite-image",
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-image-preview",
];

/**
 * When the key has no image quota every scene would otherwise pay a failed
 * round-trip, so failures park the provider until the cooldown expires.
 */
const COOLDOWN_MS = Number(process.env.GEMINI_COOLDOWN_MS) || 10 * 60_000;

let cooldownUntil = 0;
let lastError: string | null = null;

/** All configured Gemini keys (primary + GEMINI_API_KEY_2 / comma list). */
export function listGeminiApiKeys(): string[] {
  const fromList = (process.env.GEMINI_API_KEYS || "")
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const singles = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GOOGLE_API_KEY,
  ]
    .map((item) => item?.trim() || "")
    .filter(Boolean);
  return [...new Set([...singles, ...fromList])];
}

export function getGeminiImageConfig(): GeminiImageConfig | null {
  const apiKey = listGeminiApiKeys()[0] || "";
  if (!apiKey) return null;

  const model = process.env.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_MODELS[0];
  const baseUrl =
    process.env.GEMINI_API_BASE_URL?.trim()?.replace(/\/$/, "") ||
    "https://generativelanguage.googleapis.com/v1beta";

  return { apiKey, model, baseUrl };
}

export function isGeminiImageConfigured() {
  return Boolean(getGeminiImageConfig());
}

/** Configured, not parked by a recent failure, and therefore worth trying. */
export function isGeminiImageUsable() {
  return isGeminiImageConfigured() && Date.now() >= cooldownUntil;
}

export function getGeminiImageStatus(): GeminiImageStatus {
  const config = getGeminiImageConfig();
  return {
    configured: Boolean(config),
    model: config?.model ?? null,
    available: isGeminiImageUsable(),
    lastError,
    cooldownRemainingMs: Math.max(0, cooldownUntil - Date.now()),
  };
}

export function resetGeminiImageCooldown() {
  cooldownUntil = 0;
  lastError = null;
}

function describeApiError(status: number, body: string): string {
  let message = body.slice(0, 400);
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) message = parsed.error.message;
  } catch {
    // keep raw body
  }

  if (status === 429 && /limit: 0/.test(message)) {
    return "Gemini image models report quota limit 0 on this API key (free-tier image quota is not enabled). Image/Motion still use Pollinations. Enable billing or use an AI Studio key with image quota to speed stills up.";
  }
  if (status === 429) return `Gemini rate limit reached: ${message}`;
  if (status === 403) return `Gemini rejected the API key: ${message}`;
  if (status === 404) return `Gemini model unavailable: ${message}`;
  return `Gemini HTTP ${status}: ${message}`;
}

function extractImageBytes(payload: unknown): Buffer | null {
  const root = payload as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { data?: string; mimeType?: string };
          inline_data?: { data?: string; mimeType?: string; mime_type?: string };
        }>;
      };
    }>;
  };

  for (const candidate of root.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const data = part.inlineData?.data || part.inline_data?.data;
      if (!data) continue;
      const bytes = Buffer.from(data, "base64");
      if (bytes.length > 800) return bytes;
    }
  }
  return null;
}

export async function fetchGeminiImage(
  prompt: string,
  timeoutMs = Number(process.env.IMAGE_FETCH_TIMEOUT_MS) || 18_000
): Promise<Buffer | null> {
  const config = getGeminiImageConfig();
  const apiKeys = listGeminiApiKeys();
  if (!config || !apiKeys.length) return null;
  if (Date.now() < cooldownUntil) return null;

  const models = [config.model, ...DEFAULT_MODELS.filter((item) => item !== config.model)];
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt.trim().slice(0, 900) }] }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { aspectRatio: "16:9" },
    },
  };

  let failure: string | null = null;
  let hardFailures = 0;

  for (const apiKey of apiKeys) {
    for (const model of models) {
      if (Date.now() < cooldownUntil) return null;
      try {
        const url = `${config.baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok) {
          const text = await response.text();
          failure = describeApiError(response.status, text);
          if (response.status === 429 || (response.status === 403 && /key|permission/i.test(text))) {
            hardFailures += 1;
            // Try the next API key before parking the whole provider.
            break;
          }
          continue;
        }

        const bytes = extractImageBytes(await response.json());
        if (bytes) {
          lastError = null;
          cooldownUntil = 0;
          return bytes;
        }
        failure = `Gemini model ${model} returned no image data.`;
      } catch (caught) {
        failure = caught instanceof Error ? caught.message : `Gemini request to ${model} failed.`;
      }
    }
  }

  lastError = failure;
  // Park only when every key hit quota/auth errors.
  if (hardFailures >= apiKeys.length || (failure && /limit: 0|rejected the API key/.test(failure || ""))) {
    cooldownUntil = Date.now() + COOLDOWN_MS;
  }
  return null;
}
