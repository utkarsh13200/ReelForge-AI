import { existsSync } from "fs";
import { join } from "path";

function nodeModulesFfmpeg(): string {
  const name = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return join(process.cwd(), "node_modules", "ffmpeg-static", name);
}

/** Resolve ffmpeg binary — avoids Next.js bundling breaking ffmpeg-static paths. */
export async function resolveFfmpegPath(): Promise<string> {
  const candidates: string[] = [nodeModulesFfmpeg()];

  try {
    const ffmpegStatic = await import("ffmpeg-static");
    const bundled = ffmpegStatic.default;
    if (typeof bundled === "string" && bundled.length > 0) {
      candidates.push(bundled);
    }
  } catch {
    // ignore
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return "ffmpeg";
}
