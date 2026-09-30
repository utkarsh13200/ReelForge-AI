import { absolutizeAppUrl } from "@/lib/demo/urls";

export function isRasterImage(bytes: Buffer, contentType?: string | null) {
  if (bytes.length < 800) return false;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return true;
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return true;
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return true;
  return Boolean(contentType?.startsWith("image/"));
}

export function isMp4(bytes: Buffer, contentType?: string | null) {
  if (bytes.length < 1000) return false;
  if (contentType?.includes("mp4") || contentType?.includes("video")) return true;
  const head = bytes.subarray(4, 12).toString("ascii");
  return head.includes("ftyp");
}

export function firstMediaUrl(output: unknown): string | null {
  if (typeof output === "string" && /^https?:\/\//.test(output)) return output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const found = firstMediaUrl(item);
      if (found) return found;
    }
  }
  if (output && typeof output === "object") {
    const record = output as Record<string, unknown>;
    return (
      firstMediaUrl(record.url) ||
      firstMediaUrl(record.video) ||
      firstMediaUrl(record.image) ||
      firstMediaUrl(record.output)
    );
  }
  return null;
}

export async function downloadMedia(
  url: string,
  timeoutMs = 45_000
): Promise<{ bytes: Buffer; contentType: string | null } | null> {
  try {
    const response = await fetch(absolutizeAppUrl(url), {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return { bytes, contentType: response.headers.get("content-type") };
  } catch {
    return null;
  }
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
