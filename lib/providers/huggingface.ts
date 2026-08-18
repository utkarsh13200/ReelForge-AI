import { downloadMedia, firstMediaUrl, isRasterImage, isMp4 } from "@/lib/providers/media-bytes";
import { isProviderOpen, parkProvider, shouldParkProvider } from "@/lib/providers/circuit";

function hfToken() {
  return (
    process.env.HF_TOKEN?.trim() ||
    process.env.HUGGINGFACE_API_KEY?.trim() ||
    process.env.HUGGING_FACE_HUB_TOKEN?.trim() ||
    ""
  );
}

export function isHuggingFaceConfigured() {
  return Boolean(hfToken());
}

function imageModel() {
  return process.env.HF_IMAGE_MODEL?.trim() || "black-forest-labs/FLUX.1-schnell";
}

function imageProvider() {
  return process.env.HF_IMAGE_PROVIDER?.trim() || "together";
}

function videoModel() {
  return process.env.HF_VIDEO_MODEL?.trim() || "Wan-AI/Wan2.1-T2V-1.3B";
}

function decodeImagePayload(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const root = json as { data?: Array<{ b64_json?: string; url?: string; image?: string }> };
  const item = root.data?.[0];
  if (item?.b64_json) return `b64:${item.b64_json}`;
  if (item?.url) return item.url;
  if (item?.image) return item.image;
  return firstMediaUrl(json);
}

export async function fetchHuggingFaceImage(prompt: string, timeoutMs = 12_000): Promise<Buffer | null> {
  if (!isHuggingFaceConfigured() || !isProviderOpen("hf")) return null;
  try {
    const response = await fetch(`https://router.huggingface.co/${imageProvider()}/v1/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: imageModel(),
        prompt: prompt.trim().slice(0, 800),
        response_format: "b64_json",
        n: 1,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    if (shouldParkProvider(response.status, text)) {
      parkProvider("hf");
      return null;
    }
    if (!response.ok) return null;
    const payload = decodeImagePayload(JSON.parse(text) as unknown);
    if (!payload) return null;
    if (payload.startsWith("b64:")) {
      const bytes = Buffer.from(payload.slice(4), "base64");
      return isRasterImage(bytes, "image/jpeg") ? bytes : null;
    }
    const downloaded = await downloadMedia(payload, 15_000);
    if (downloaded && isRasterImage(downloaded.bytes, downloaded.contentType)) return downloaded.bytes;
  } catch {
    // next provider
  }
  return null;
}

export async function fetchHuggingFaceVideo(prompt: string, timeoutMs = 12_000): Promise<Buffer | null> {
  if (!isHuggingFaceConfigured() || !isProviderOpen("hf-video")) return null;
  try {
    const response = await fetch(`https://router.huggingface.co/${imageProvider()}/v1/videos/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: videoModel(),
        prompt: prompt.trim().slice(0, 800),
        n: 1,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const contentType = response.headers.get("content-type");
    const bytes = Buffer.from(await response.arrayBuffer());
    const body = contentType?.includes("json") ? bytes.toString("utf8") : "";
    if (shouldParkProvider(response.status, body) || !response.ok) {
      parkProvider("hf-video");
      return null;
    }
    if (isMp4(bytes, contentType)) return bytes;
    if (body) {
      const url = firstMediaUrl(JSON.parse(body) as unknown);
      if (!url) {
        parkProvider("hf-video");
        return null;
      }
      const downloaded = await downloadMedia(url);
      if (downloaded && isMp4(downloaded.bytes, downloaded.contentType)) return downloaded.bytes;
    }
  } catch {
    parkProvider("hf-video");
  }
  return null;
}
