import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const exec = promisify(execFile);
const ffmpeg = (await import("ffmpeg-static")).default || "ffmpeg";
const url =
  "https://image.pollinations.ai/prompt/cinematic%20mountain%20sunset?width=640&height=360&nologo=true&seed=42&model=flux";
const dir = await mkdtemp(join(tmpdir(), "fftest-"));
const out = join(dir, "test.mp4");

try {
  await exec(
    ffmpeg,
    [
      "-y",
      "-loop",
      "1",
      "-i",
      url,
      "-t",
      "2",
      "-vf",
      "scale=640:360",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      out,
    ],
    { timeout: 120000 }
  );
  const bytes = await readFile(out);
  console.log("ffmpeg URL OK", bytes.length, "bytes");
} catch (e) {
  console.log("ffmpeg URL FAIL", e.message?.slice(0, 300));
}

await rm(dir, { recursive: true, force: true });
