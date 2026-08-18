import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { resolveFfmpegPath } from "@/lib/visuals/ffmpeg-path";

const execFileAsync = promisify(execFile);

export async function concatMp3Buffers(buffers: Buffer[]): Promise<Buffer> {
  if (!buffers.length) throw new Error("No audio chunks to concatenate.");
  if (buffers.length === 1) return buffers[0];

  const ffmpegPath = await resolveFfmpegPath();
  const tempDir = await mkdtemp(join(tmpdir(), "reelforge-voice-"));
  const chunkPaths: string[] = [];

  try {
    for (let index = 0; index < buffers.length; index += 1) {
      const chunkPath = join(tempDir, `chunk-${index}.mp3`);
      await writeFile(chunkPath, new Uint8Array(buffers[index]));
      chunkPaths.push(chunkPath);
    }

    const listPath = join(tempDir, "concat.txt");
    const listBody = chunkPaths
      .map((filePath) => `file '${filePath.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
      .join("\n");
    await writeFile(listPath, listBody, "utf8");

    const outputPath = join(tempDir, "voiceover.mp3");
    await execFileAsync(ffmpegPath, [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      outputPath,
    ]);

    return readFile(outputPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
