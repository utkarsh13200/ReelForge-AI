import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { resolveFfmpegPath } from "@/lib/visuals/ffmpeg-path";

const execFileAsync = promisify(execFile);

const FRAME_TIMES = ["00:00:00.3", "00:00:02", "00:00:05", "00:00:10"];

export async function downloadMediaBytes(url: string, timeoutMs = 45_000): Promise<Buffer | null> {
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length > 1000 ? bytes : null;
  } catch {
    return null;
  }
}

export async function extractVideoFramesFromUrl(url: string, count = 3): Promise<Buffer[]> {
  const bytes = await downloadMediaBytes(url);
  if (!bytes) return [];
  return extractVideoFramesFromBytes(bytes, count);
}

export async function extractVideoFramesFromBytes(bytes: Buffer, count = 3): Promise<Buffer[]> {
  const ffmpegPath = await resolveFfmpegPath();
  const tempDir = await mkdtemp(join(tmpdir(), "reelforge-thumb-"));
  const inputPath = join(tempDir, "source.mp4");
  const frames: Buffer[] = [];

  try {
    await writeFile(inputPath, new Uint8Array(bytes));
    const stamps = FRAME_TIMES.slice(0, Math.max(1, count));

    for (const stamp of stamps) {
      const outputPath = join(tempDir, `frame-${stamp.replace(/[^\d]/g, "")}.jpg`);
      try {
        await execFileAsync(
          ffmpegPath,
          [
            "-y",
            "-ss",
            stamp,
            "-i",
            inputPath,
            "-frames:v",
            "1",
            "-q:v",
            "3",
            "-vf",
            "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,format=yuv420p",
            outputPath,
          ],
          { timeout: 20_000 }
        );
        const frame = await readFile(outputPath);
        if (frame.length > 800) frames.push(frame);
      } catch {
        // skip missing timestamps on short clips
      }
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }

  return frames;
}
