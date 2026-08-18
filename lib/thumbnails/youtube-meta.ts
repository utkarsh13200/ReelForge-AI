import { extractYouTubeVideoId } from "@/lib/script/utils";

export type YouTubeThumbnailMeta = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
};

export function normalizeYouTubeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(www\.)?(youtube\.com|youtu\.be)\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export function parseThumbnailPromptInput(value: string): {
  description: string;
  youtubeUrl: string;
} {
  const trimmed = value.trim();
  if (!trimmed) return { description: "", youtubeUrl: "" };
  const normalized = normalizeYouTubeUrl(trimmed);
  if (extractYouTubeVideoId(normalized) || /(?:youtube\.com|youtu\.be)\//i.test(normalized)) {
    return { description: "", youtubeUrl: normalized };
  }
  return { description: trimmed, youtubeUrl: "" };
}

export async function fetchYouTubeThumbnailMeta(url: string): Promise<YouTubeThumbnailMeta | null> {
  const videoId = extractYouTubeVideoId(normalizeYouTubeUrl(url));
  if (!videoId) return null;

  let title = "YouTube video";
  try {
    const oembed = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
      { cache: "no-store", signal: AbortSignal.timeout(10_000) }
    );
    if (oembed.ok) {
      const json = (await oembed.json()) as { title?: string };
      if (json.title?.trim()) title = json.title.trim();
    }
  } catch {
    // title stays fallback
  }

  const candidates = [
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  ];

  for (const thumbnailUrl of candidates) {
    const bytes = await downloadImageBytes(thumbnailUrl);
    if (bytes && bytes.length > 8_000) {
      return { videoId, title, thumbnailUrl };
    }
  }

  return { videoId, title, thumbnailUrl: candidates[2] };
}

export async function downloadImageBytes(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length > 800 ? bytes : null;
  } catch {
    return null;
  }
}
