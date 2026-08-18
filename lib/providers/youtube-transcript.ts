import { getSubtitles } from "youtube-caption-extractor";

export class TranscriptUnavailableError extends Error {
  constructor(message = "This video has no captions available.") {
    super(message);
    this.name = "TranscriptUnavailableError";
  }
}

const LANG_CANDIDATES = ["en", "en-US", "en-GB", "a.en", "hi", "es", "fr", "de", "pt"];

export async function fetchYouTubeTranscript(videoId: string) {
  let lastError: Error | null = null;

  for (const lang of LANG_CANDIDATES) {
    try {
      const lines = await getSubtitles({ videoID: videoId, lang });
      if (lines?.length) {
        return lines.map((line) => line.text).join(" ").replace(/\s+/g, " ").trim();
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  try {
    const lines = await getSubtitles({ videoID: videoId });
    if (lines?.length) {
      return lines.map((line) => line.text).join(" ").replace(/\s+/g, " ").trim();
    }
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error));
  }

  if (lastError instanceof TranscriptUnavailableError) throw lastError;
  throw new TranscriptUnavailableError(
    lastError?.message || "Could not fetch captions for this video."
  );
}
