import { execFile } from "child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import type { TimelineJson, TimelineScene, TimelineAspectRatio } from "@/lib/types/timeline";
import { wordsToSrt } from "@/lib/export/captions-srt";
import { createKenBurnsVideoFromSource } from "@/lib/visuals/ken-burns-video";
import { resolveFfmpegPath } from "@/lib/visuals/ffmpeg-path";

const execFileAsync = promisify(execFile);

export type ExportRenderProgress = (progress: number, message: string) => Promise<void>;

function isVideoUrl(url: string, mode?: string) {
  return (
    mode === "video" ||
    /\.mp4($|\?)/i.test(url) ||
    url.includes("video/mp4") ||
    url.startsWith("data:video/")
  );
}

function ffmpegSubtitlesPath(filePath: string) {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function encodeDimensions(aspectRatio: TimelineAspectRatio) {
  switch (aspectRatio) {
    case "9:16":
      return { width: 720, height: 1280 };
    case "1:1":
      return { width: 1080, height: 1080 };
    default:
      return { width: 1280, height: 720 };
  }
}

function scaleFilter(width: number, height: number) {
  return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=30,format=yuv420p`;
}

async function materializeUrl(url: string, destWithoutExt: string): Promise<string> {
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("Invalid data URL.");
    const mime = match[1];
    const ext = mime.includes("png") ? ".png" : mime.includes("mp4") ? ".mp4" : ".jpg";
    const dest = `${destWithoutExt}${ext}`;
    await writeFile(dest, new Uint8Array(Buffer.from(match[2], "base64")));
    return dest;
  }

  if (url.startsWith("/")) {
    const local = join(process.cwd(), "public", url.replace(/^\//, ""));
    if (existsSync(local)) {
      const ext = local.match(/\.[a-z0-9]+$/i)?.[0] || ".bin";
      const dest = `${destWithoutExt}${ext}`;
      await copyFile(local, dest);
      return dest;
    }
  }

  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Could not download media (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 800) throw new Error("Downloaded media was empty.");
  const ext =
    bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70
      ? ".mp4"
      : bytes[0] === 0xff && bytes[1] === 0xd8
        ? ".jpg"
        : bytes[0] === 0x89 && bytes[1] === 0x50
          ? ".png"
          : bytes[0] === 0x49 && bytes[1] === 0x44
            ? ".mp3"
            : /\.mp3($|\?)/i.test(url)
              ? ".mp3"
              : ".bin";
  const dest = `${destWithoutExt}${ext}`;
  await writeFile(dest, new Uint8Array(bytes));
  return dest;
}

async function concatClips(
  ffmpegPath: string,
  clipPaths: string[],
  tempDir: string,
  outputPath: string,
  width: number,
  height: number
) {
  const vf = scaleFilter(width, height);
  if (clipPaths.length === 1) {
    await execFileAsync(
      ffmpegPath,
      [
        "-y",
        "-i",
        clipPaths[0],
        "-vf",
        vf,
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        outputPath,
      ],
      { timeout: 60_000 }
    );
    return;
  }
  const listPath = join(tempDir, "concat-list.txt");
  const listBody = clipPaths.map((path) => `file '${path.replace(/\\/g, "/")}'`).join("\n");
  await writeFile(listPath, listBody, "utf8");
  await execFileAsync(
    ffmpegPath,
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-vf",
      vf,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outputPath,
    ],
    { timeout: 120_000 }
  );
}

async function buildSilentFromScenes(
  ffmpegPath: string,
  scenes: TimelineScene[],
  tempDir: string,
  width: number,
  height: number
) {
  const clips: string[] = [];
  for (const [index, scene] of scenes.entries()) {
    const source = await materializeUrl(scene.url, join(tempDir, `scene-${index}`));
    const clipPath = join(tempDir, `clip-${index}.mp4`);
    const duration = Math.max(0.6, scene.durationSeconds || 5);

    if (isVideoUrl(scene.url, scene.mode)) {
      await execFileAsync(
        ffmpegPath,
        [
          "-y",
          "-i",
          source,
          "-t",
          duration.toFixed(3),
          "-an",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-pix_fmt",
          "yuv420p",
          clipPath,
        ],
        { timeout: 60_000 }
      );
    } else {
      await createKenBurnsVideoFromSource(source, duration, clipPath);
    }
    clips.push(clipPath);
  }

  const silentPath = join(tempDir, "silent.mp4");
  await concatClips(ffmpegPath, clips, tempDir, silentPath, width, height);
  return silentPath;
}

export async function muxExportWithFfmpeg(
  timeline: TimelineJson,
  visualVideoUrl: string | null | undefined,
  onProgress?: ExportRenderProgress
): Promise<Buffer> {
  const ffmpegPath = await resolveFfmpegPath();
  const { width, height } = encodeDimensions(timeline.aspectRatio);
  const tempDir = await mkdtemp(join(tmpdir(), "reelforge-mux-"));
  const outputPath = join(tempDir, "export.mp4");

  try {
    if (onProgress) await onProgress(8, "Preparing video and audio…");

    let videoPath: string;
    if (visualVideoUrl) {
      videoPath = await materializeUrl(visualVideoUrl, join(tempDir, "project-video"));
    } else {
      const scenes = timeline.scenes.filter((scene) => scene.url);
      if (!scenes.length) throw new Error("No visual scenes available to export.");
      if (onProgress) await onProgress(18, "Building video from scenes…");
      videoPath = await buildSilentFromScenes(ffmpegPath, scenes, tempDir, width, height);
    }

    if (!timeline.voiceTrack?.url) {
      throw new Error("Voice track is missing. Generate voiceover in Module 3.");
    }

    if (onProgress) await onProgress(40, "Mixing narration…");
    const voicePath = await materializeUrl(timeline.voiceTrack.url, join(tempDir, "voice"));

    let musicPath: string | null = null;
    if (timeline.music?.url) {
      try {
        musicPath = await materializeUrl(timeline.music.url, join(tempDir, "music"));
      } catch {
        musicPath = null;
      }
    }

    let captionsPath: string | null = null;
    if (timeline.captions?.words?.length) {
      const srt = wordsToSrt(timeline.captions.words);
      if (srt.trim()) {
        captionsPath = join(tempDir, "captions.srt");
        await writeFile(captionsPath, srt, "utf8");
      }
    }

    if (onProgress) await onProgress(62, "Encoding final MP4…");

    const musicVolume = Math.min(1, Math.max(0.05, timeline.music?.volume ?? 0.35));
    const duration = Math.max(1, timeline.voiceTrack.durationSeconds || timeline.totalDurationSeconds || 10);
    const videoFilter = (withCaptions: boolean) => {
      const chain = `${scaleFilter(width, height)},tpad=stop_mode=clone:stop=-1,trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS`;
      if (withCaptions && captionsPath) {
        return `${chain},subtitles='${ffmpegSubtitlesPath(captionsPath)}'`;
      }
      return chain;
    };

    const runMux = async (withCaptions: boolean) => {
      const args = ["-y", "-i", videoPath, "-i", voicePath];
      if (musicPath) args.push("-i", musicPath);

      if (musicPath) {
        args.push(
          "-filter_complex",
          `[0:v]${videoFilter(withCaptions)}[v];[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=1[a1];[2:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=${musicVolume}[a2];[a1][a2]amix=inputs=2:duration=first:dropout_transition=2[a]`,
          "-map",
          "[v]",
          "-map",
          "[a]"
        );
      } else {
        args.push(
          "-vf",
          videoFilter(withCaptions),
          "-map",
          "0:v:0",
          "-map",
          "1:a:0"
        );
      }

      args.push(
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ac",
        "2",
        "-ar",
        "44100",
        "-t",
        duration.toFixed(3),
        "-movflags",
        "+faststart",
        outputPath
      );

      await execFileAsync(ffmpegPath, args, { timeout: 280_000, maxBuffer: 32 * 1024 * 1024 });
    };

    try {
      await runMux(Boolean(captionsPath));
    } catch (firstError) {
      try {
        await runMux(false);
      } catch (secondError) {
        const stderr =
          secondError && typeof secondError === "object" && "stderr" in secondError
            ? String((secondError as { stderr?: string }).stderr ?? "").slice(-800)
            : "";
        const message = secondError instanceof Error ? secondError.message : "ffmpeg mux failed";
        throw new Error(stderr ? `${message}\n${stderr}` : message || String(firstError));
      }
    }

    if (onProgress) await onProgress(96, "Finalizing MP4…");
    const bytes = await readFile(outputPath);
    if (bytes.length < 1000) throw new Error("Export produced an empty video.");
    return bytes;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
