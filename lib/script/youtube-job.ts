import { chatCompletion } from "@/lib/providers/llm";
import { fetchYouTubeTranscript } from "@/lib/providers/youtube-transcript";
import type { ScriptYoutubeJobPayload } from "@/lib/types/project";
import { extractYouTubeVideoId } from "@/lib/script/utils";

export function createYoutubeJobPayload(input: {
  projectId: string;
  url: string;
  modifyTranscript?: boolean;
  modifyInstructions?: string;
}): ScriptYoutubeJobPayload {
  const videoId = extractYouTubeVideoId(input.url);
  if (!videoId) {
    throw new Error("Enter a valid YouTube URL.");
  }
  return {
    kind: "script_youtube",
    projectId: input.projectId,
    url: input.url.trim(),
    videoId,
    phase: "fetch",
    rawTranscript: "",
    script: "",
    modifyTranscript: input.modifyTranscript !== false,
    modifyInstructions: input.modifyInstructions?.trim() ?? "",
    message: "Fetching video captions…",
  };
}

export async function advanceYoutubeJob(payload: ScriptYoutubeJobPayload): Promise<ScriptYoutubeJobPayload> {
  if (payload.phase === "fetch") {
    const rawTranscript = await fetchYouTubeTranscript(payload.videoId);
    if (!payload.modifyTranscript) {
      return {
        ...payload,
        phase: "done",
        rawTranscript,
        script: rawTranscript,
        message: "Transcript imported.",
      };
    }
    return {
      ...payload,
      phase: "clean",
      rawTranscript,
      script: rawTranscript,
      message: "Cleaning and structuring the transcript…",
    };
  }

  if (payload.phase === "clean") {
    const instruction = payload.modifyInstructions
      ? payload.modifyInstructions
      : "Rewrite this raw YouTube transcript into a clean, readable narration script. Fix punctuation, remove filler words, and break into paragraphs. Output script text only.";

    const script = await chatCompletion(
      [
        {
          role: "system",
          content:
            "You rewrite raw YouTube captions into polished narration scripts. Output script text only — no headings or markdown.",
        },
        {
          role: "user",
          content: `${instruction}\n\nTranscript:\n\n${payload.rawTranscript.slice(0, 12000)}`,
        },
      ],
      4000
    );

    return {
      ...payload,
      phase: "done",
      script,
      message: "Transcript converted to script.",
    };
  }

  return payload;
}
