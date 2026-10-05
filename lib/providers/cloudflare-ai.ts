import { isRasterImage } from "@/lib/providers/media-bytes";
import { isProviderOpen, parkProvider, shouldParkProvider } from "@/lib/providers/circuit";

/**
 * Cloudflare Workers AI — FLUX.1 Schnell via REST.
 * Needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (Workers AI permission).
 * https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/
 */

function accountId() {
  return (
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
    process.env.CF_ACCOUNT_ID?.trim() ||
    ""
  );
}

function apiToken() {
  return (
    process.env.CLOUDFLARE_API_TOKEN?.trim() ||
    process.env.CLOUDFLARE_AI_API_TOKEN?.trim() ||
    process.env.CF_API_TOKEN?.trim() ||
    ""
  );
}

function modelId() {
  return (
    process.env.CLOUDFLARE_IMAGE_MODEL?.trim() ||
    "@cf/black-forest-labs/flux-1-schnell"
  );
}

export function isCloudflareAiConfigured() {
  return Boolean(accountId() && apiToken()) && isProviderOpen("cloudflare-ai");
}

function decodeImagePayload(json: unknown): Buffer | null {
  if (!json || typeof json !== "object") return null;
  const root = json as {
    result?: { image?: string; images?: string[] };
    image?: string;
    success?: boolean;
  };
  const b64 = root.result?.image || root.result?.images?.[0] || root.image;
  if (!b64 || typeof b64 !== "string") return null;
  const raw = b64.replace(/^data:image\/\w+;base64,/, "");
  const bytes = Buffer.from(raw, "base64");
  return isRasterImage(bytes, "image/jpeg") ? bytes : null;
}

export async function fetchCloudflareAiImage(
  prompt: string,
  timeoutMs = 20_000,
  seed = Date.now()
): Promise<Buffer | null> {
  if (!isCloudflareAiConfigured()) return null;
  const clipped = prompt.trim().slice(0, 2000);
  if (!clipped) return null;

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId()}/ai/run/${modelId()}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken()}`,
        "Content-Type": "application/json",
      },
      // FLUX.1 Schnell rejects unknown fields (e.g. `seed`) with HTTP 400.
      body: JSON.stringify({
        prompt: `${clipped}${seed ? ` (variation ${Math.abs(seed) % 10_000})` : ""}`,
        steps: Number(process.env.CLOUDFLARE_IMAGE_STEPS || 4),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });

    // Some endpoints return raw JPEG/PNG bytes.
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) {
      const text = await response.text();
      // Only inspect short error bodies — never scan base64 image payloads
      // (random JPEG base64 can contain substrings like "forbidden").
      if (shouldParkProvider(response.status, text.slice(0, 800))) {
        parkProvider("cloudflare-ai");
      }
      return null;
    }

    if (contentType.startsWith("image/")) {
      const bytes = Buffer.from(await response.arrayBuffer());
      return isRasterImage(bytes, contentType) ? bytes : null;
    }

    const text = await response.text();
    try {
      return decodeImagePayload(JSON.parse(text) as unknown);
    } catch {
      const bytes = Buffer.from(text, "base64");
      return isRasterImage(bytes, "image/jpeg") ? bytes : null;
    }
  } catch {
    return null;
  }
}
