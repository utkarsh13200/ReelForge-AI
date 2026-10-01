import type { WordTimestamp } from "@/lib/types/voice";

/**
 * Free HTTP TTS fallback for Linux/serverless (Edge TTS often times out on Vercel).
 * Uses Google Translate's public TTS endpoint for short English chunks.
 */
function estimateWordTimestamps(
  text: string,
  durationSeconds: number,
  offsetSeconds: number
): WordTimestamp[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const each = durationSeconds / words.length;
  return words.map((word, index) => ({
    word,
    start: offsetSeconds + index * each,
    end: offsetSeconds + (index + 1) * each,
  }));
}

async function fetchOneChunk(text: string): Promise<Buffer> {
  const url =
    "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=" +
    encodeURIComponent(text);
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.8",
      Referer: "https://translate.google.com/",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`Google TTS HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 200) throw new Error("Google TTS returned empty audio.");
  return bytes;
}

function splitForGoogleTts(text: string, maxChars = 160): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) chunks.push(current);
    current = word;
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function synthesizeWithGoogleTts(
  text: string,
  timeOffsetSeconds = 0
): Promise<{ audio: Buffer; subtitles: WordTimestamp[]; chunkDurationSeconds: number }> {
  const clipped = text.trim();
  if (!clipped) throw new Error("Nothing to narrate.");

  const parts = splitForGoogleTts(clipped);
  const buffers: Buffer[] = [];
  for (const part of parts) {
    buffers.push(await fetchOneChunk(part));
  }
  const audio = Buffer.concat(buffers.map((b) => new Uint8Array(b)));
  // Rough duration estimate (~16kbps effective for this endpoint).
  const chunkDurationSeconds = Math.max(1, audio.length / 4000);
  return {
    audio,
    subtitles: estimateWordTimestamps(clipped, chunkDurationSeconds, timeOffsetSeconds),
    chunkDurationSeconds,
  };
}
