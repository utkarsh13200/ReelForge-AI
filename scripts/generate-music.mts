import { mkdir } from "fs/promises";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { resolveFfmpegPath } from "../lib/visuals/ffmpeg-path";

const execFileAsync = promisify(execFile);
const ffmpeg = await resolveFfmpegPath();
const dir = join(process.cwd(), "public", "music");
await mkdir(dir, { recursive: true });

const tracks = [
  {
    file: "ambient-focus.mp3",
    expr: "0.10*sin(2*PI*196*t)+0.07*sin(2*PI*247*t)+0.05*sin(2*PI*294*t)+0.03*sin(2*PI*392*t)",
  },
  {
    file: "uplift-drive.mp3",
    expr: "0.11*sin(2*PI*262*t)+0.08*sin(2*PI*330*t)+0.06*sin(2*PI*392*t)+0.04*sin(2*PI*523*t)",
  },
  {
    file: "soft-story.mp3",
    expr: "0.09*sin(2*PI*174*t)+0.07*sin(2*PI*220*t)+0.05*sin(2*PI*261*t)+0.03*sin(2*PI*349*t)",
  },
];

for (const track of tracks) {
  const out = join(dir, track.file);
  await execFileAsync(
    ffmpeg,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `aevalsrc=${track.expr}:s=44100:d=45`,
      "-af",
      "afade=t=in:st=0:d=1.5,afade=t=out:st=43:d=2,volume=0.45",
      "-c:a",
      "libmp3lame",
      "-q:a",
      "4",
      out,
    ],
    { timeout: 30_000 }
  );
  console.log("wrote", out);
}
