import type { SupabaseClient } from "@supabase/supabase-js";
import type { Thumbnail } from "@/lib/types/thumbnail";
import { buildThumbnailPrompts, deriveThumbnailHeadline, type ThumbnailPromptInput } from "@/lib/thumbnails/build-prompts";
import { extractVideoFramesFromBytes, downloadMediaBytes } from "@/lib/thumbnails/extract-frames";
import {
  persistThumbnailCandidate,
  persistThumbnailCandidateFromBytes,
} from "@/lib/thumbnails/persist-thumbnail";
import {
  downloadImageBytes,
  fetchYouTubeThumbnailMeta,
  parseThumbnailPromptInput,
} from "@/lib/thumbnails/youtube-meta";

export const TARGET_CANDIDATE_COUNT = 4;
export const MAX_UPLOAD_VIDEO_BYTES = 40 * 1024 * 1024;
export const MAX_UPLOAD_IMAGE_BYTES = 8 * 1024 * 1024;

export type ThumbnailGenerateRequest = {
  title: string | null;
  script: string | null;
  visualVideoUrl: string | null;
  sourceUrl: string | null;
  description: string;
  youtubeUrl: string;
  headline: string;
  useProjectVideo: boolean;
  videoBytes: Buffer | null;
  referenceBytes: Buffer | null;
};

type ReadyStill = { prompt: string; bytes: Buffer };

export async function generateThumbnailCandidates(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  request: ThumbnailGenerateRequest
) {
  const parsedBox = parseThumbnailPromptInput(request.description);
  const parsedUrl = parseThumbnailPromptInput(request.youtubeUrl);
  const parsedSource = parseThumbnailPromptInput(request.sourceUrl || "");
  const youtubeUrl =
    parsedUrl.youtubeUrl || parsedBox.youtubeUrl || (!parsedBox.description ? parsedSource.youtubeUrl : "");
  const description = parsedBox.description || (!youtubeUrl ? request.description.trim() : "");

  const ready: ReadyStill[] = [];
  let youtubeTitle: string | undefined;

  if (request.referenceBytes?.length) {
    ready.push({ prompt: "Uploaded reference image", bytes: request.referenceBytes });
  }

  if (youtubeUrl) {
    const meta = await fetchYouTubeThumbnailMeta(youtubeUrl);
    if (meta) {
      youtubeTitle = meta.title;
      const ytBytes = await downloadImageBytes(meta.thumbnailUrl);
      if (ytBytes) {
        ready.push({ prompt: `YouTube still: ${meta.title}`, bytes: ytBytes });
      }
    }
  }

  const videoBytes =
    request.videoBytes ??
    (request.useProjectVideo && request.visualVideoUrl
      ? await downloadMediaBytes(request.visualVideoUrl)
      : null);

  if (videoBytes) {
    const frameCount = ready.length >= 2 ? 1 : 2;
    const frames = await extractVideoFramesFromBytes(videoBytes, frameCount);
    frames.forEach((bytes, index) => {
      ready.push({ prompt: `Video still ${index + 1}`, bytes });
    });
  }

  const promptInput: ThumbnailPromptInput = {
    title: request.title,
    script: request.script,
    description,
    youtubeTitle,
    fromVideo: Boolean(videoBytes || youtubeUrl),
  };

  const headline =
    request.headline.trim() || deriveThumbnailHeadline(promptInput);

  const hasSource =
    Boolean(description) ||
    Boolean(youtubeUrl) ||
    Boolean(videoBytes) ||
    Boolean(request.referenceBytes?.length) ||
    Boolean(request.script?.trim());

  if (!hasSource) {
    if (request.useProjectVideo && request.visualVideoUrl) {
      throw new Error("Could not read the project video. Upload a clip or describe the thumbnail instead.");
    }
    throw new Error("Describe the thumbnail you want, paste a YouTube URL, or add a video.");
  }

  await supabase.from("thumbnails").delete().eq("project_id", projectId).eq("is_selected", false);

  const rows: Thumbnail[] = [];
  for (const [index, still] of ready.slice(0, TARGET_CANDIDATE_COUNT).entries()) {
    try {
        rows.push(
          (await persistThumbnailCandidateFromBytes(
            supabase,
            userId,
            projectId,
            still.prompt,
            index,
            headline,
            still.bytes
          )) as Thumbnail
        );
    } catch {
      // skip a bad still and fill with AI later
    }
  }

  const needed = TARGET_CANDIDATE_COUNT - rows.length;
  if (needed > 0) {
    const prompts = await buildThumbnailPrompts(promptInput, needed + 2);
    for (const prompt of prompts) {
      if (rows.length >= TARGET_CANDIDATE_COUNT) break;
      try {
        rows.push(
          (await persistThumbnailCandidate(
            supabase,
            userId,
            projectId,
            prompt,
            rows.length,
            headline
          )) as Thumbnail
        );
      } catch {
        // try the next prompt
      }
    }
  }

  if (!rows.length) {
    throw new Error("Could not generate any thumbnail candidates. Try a clearer description or another video.");
  }

  await supabase
    .from("projects")
    .update({ status: "in_progress", updated_at: new Date().toISOString() })
    .eq("id", projectId);

  return { rows, headline };
}
