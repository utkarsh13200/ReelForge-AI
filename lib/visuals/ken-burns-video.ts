import { execFile } from "child_process";
import { promisify } from "util";
import { resolveFfmpegPath } from "@/lib/visuals/ffmpeg-path";

const execFileAsync = promisify(execFile);

/** Turn a still image URL or file into a Ken Burns MP4 clip via ffmpeg. */
export async function createKenBurnsVideoFromSource(
  input: string,
  durationSec: number,
  outputPath: string
): Promise<void> {
  const ffmpegPath = await resolveFfmpegPath();
  const encodeSec = Math.min(Math.max(durationSec, 0.5), 4);
  const frames = Math.max(16, Math.round(encodeSec * 8));
  const filter = `zoompan=z=min(zoom+0.0015\\,1.15):x=iw/2-(iw/zoom/2):y=ih/2-(ih/zoom/2):d=${frames}:s=960x540:fps=8,scale=960x540`;
  const shortPath = durationSec > encodeSec + 0.05 ? `${outputPath}.short.mp4` : outputPath;

  await execFileAsync(
    ffmpegPath,
    [
      "-y",
      "-loop",
      "1",
      "-i",
      input,
      "-vf",
      filter,
      "-t",
      String(encodeSec),
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-an",
      shortPath,
    ],
    { timeout: 45_000, maxBuffer: 20 * 1024 * 1024 }
  );

  if (shortPath === outputPath) return;

  await execFileAsync(
    ffmpegPath,
    [
      "-y",
      "-stream_loop",
      "-1",
      "-i",
      shortPath,
      "-c",
      "copy",
      "-t",
      String(durationSec),
      "-movflags",
      "+faststart",
      outputPath,
    ],
    { timeout: 20_000 }
  );
}

/** Turn a still image buffer into a Ken Burns MP4 clip. */
export async function createKenBurnsVideo(imageBytes: Buffer, durationSec = 5): Promise<Buffer> {
  const { mkdtemp, readFile, rm, writeFile } = await import("fs/promises");
  const { tmpdir } = await import("os");
  const { join } = await import("path");

  const tempDir = await mkdtemp(join(tmpdir(), "reelforge-kb-"));
  const inputPath = join(tempDir, "frame.jpg");
  const outputPath = join(tempDir, "motion.mp4");

  try {
    await writeFile(inputPath, new Uint8Array(imageBytes));
    await createKenBurnsVideoFromSource(inputPath, durationSec, outputPath);
    return readFile(outputPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
