import { downloadMedia, firstMediaUrl, isMp4, isRasterImage, sleep } from "@/lib/providers/media-bytes";
import { isProviderOpen, parkProvider, shouldParkProvider } from "@/lib/providers/circuit";

function replicateToken() {
  return process.env.REPLICATE_API_TOKEN?.trim() || process.env.REPLICATE_API_KEY?.trim() || "";
}

export function isReplicateConfigured() {
  return Boolean(replicateToken());
}

function imageModel() {
  return process.env.REPLICATE_IMAGE_MODEL?.trim() || "black-forest-labs/flux-schnell";
}

function videoModel() {
  return process.env.REPLICATE_VIDEO_MODEL?.trim() || "lucataco/ltx-video";
}

async function replicatePredict(model: string, input: Record<string, unknown>, timeoutMs: number) {
  const token = replicateToken();
  const response = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait=20",
    },
    body: JSON.stringify({ input }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });

  const raw = await response.text();
  if (shouldParkProvider(response.status, raw)) {
    parkProvider("replicate");
    return null;
  }
  if (!response.ok) return null;

  const json = JSON.parse(raw) as {
    status?: string;
    output?: unknown;
    urls?: { get?: string };
  };

  if (json.status === "succeeded") return json.output;
  if (json.status === "failed" || json.status === "canceled") return null;

  const pollUrl = json.urls?.get;
  if (!pollUrl) return json.output ?? null;

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await sleep(1500);
    const poll = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await poll.json()) as { status?: string; output?: unknown };
    if (body.status === "succeeded") return body.output;
    if (body.status === "failed" || body.status === "canceled") return null;
  }
  return null;
}

export async function fetchReplicateImage(prompt: string, timeoutMs = 20_000): Promise<Buffer | null> {
  if (!isReplicateConfigured() || !isProviderOpen("replicate")) return null;
  try {
    const output = await replicatePredict(imageModel(), { prompt: prompt.trim().slice(0, 800) }, timeoutMs);
    const url = firstMediaUrl(output);
    if (!url) return null;
    const downloaded = await downloadMedia(url);
    if (downloaded && isRasterImage(downloaded.bytes, downloaded.contentType)) return downloaded.bytes;
  } catch {
    // next provider
  }
  return null;
}

export async function fetchReplicateVideo(prompt: string, timeoutMs = 25_000): Promise<Buffer | null> {
  if (!isReplicateConfigured() || !isProviderOpen("replicate")) return null;
  try {
    const output = await replicatePredict(videoModel(), { prompt: prompt.trim().slice(0, 800) }, timeoutMs);
    const url = firstMediaUrl(output);
    if (!url) return null;
    const downloaded = await downloadMedia(url, 30_000);
    if (downloaded && isMp4(downloaded.bytes, downloaded.contentType)) return downloaded.bytes;
  } catch {
    // next provider
  }
  return null;
}
