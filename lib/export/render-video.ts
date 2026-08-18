import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { TimelineJson } from "@/lib/types/timeline";
import { REMOTION_COMPOSITION_ID } from "@/lib/export/constants";
import { muxExportWithFfmpeg } from "@/lib/export/ffmpeg-mux";
import { resolveFfmpegPath } from "@/lib/visuals/ffmpeg-path";

type RenderProgressHandler = (progress: number, message: string) => Promise<void>;

let cachedServeUrl: string | null = null;

export async function renderProjectVideo(
  timeline: TimelineJson,
  onProgress?: RenderProgressHandler,
  visualVideoUrl?: string | null
): Promise<Buffer> {
  try {
    return await muxExportWithFfmpeg(timeline, visualVideoUrl, onProgress);
  } catch (ffmpegError) {
    if (process.env.EXPORT_USE_REMOTION !== "true") {
      throw ffmpegError instanceof Error ? ffmpegError : new Error("Export render failed.");
    }
  }

  return renderWithRemotion(timeline, onProgress);
}

async function renderWithRemotion(
  timeline: TimelineJson,
  onProgress?: RenderProgressHandler
): Promise<Buffer> {
  const { bundle } = await import("@remotion/bundler");
  const { renderMedia, selectComposition } = await import("@remotion/renderer");

  if (onProgress) await onProgress(5, "Bundling Remotion composition…");

  if (!cachedServeUrl) {
    const entryPoint = join(process.cwd(), "remotion", "index.ts");
    cachedServeUrl = await bundle({
      entryPoint,
      webpackOverride: (config) => {
        config.resolve = config.resolve ?? {};
        config.resolve.alias = {
          ...(config.resolve.alias ?? {}),
          "@": join(process.cwd()),
        };
        return config;
      },
    });
  }

  if (onProgress) await onProgress(15, "Preparing render…");

  const composition = await selectComposition({
    serveUrl: cachedServeUrl,
    id: REMOTION_COMPOSITION_ID,
    inputProps: { timeline },
  });

  const tempDir = await mkdtemp(join(tmpdir(), "reelforge-export-"));
  const outputLocation = join(tempDir, "export.mp4");
  const ffmpegPath = await resolveFfmpegPath();
  if (ffmpegPath) {
    process.env.REMOTION_FFMPEG_EXECUTABLE = ffmpegPath;
  }

  try {
    await renderMedia({
      composition,
      serveUrl: cachedServeUrl,
      codec: "h264",
      outputLocation,
      inputProps: { timeline },
      onProgress: ({ progress }) => {
        const pct = 15 + Math.round(progress * 80);
        void onProgress?.(pct, `Rendering video… ${Math.round(progress * 100)}%`);
      },
    });

    if (onProgress) await onProgress(98, "Finalizing MP4…");
    return readFile(outputLocation);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
