import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSceneImagesParallel } from "@/lib/providers/image";
import { fetchSceneVideosWithFallback } from "@/lib/providers/scene-video";
import { fetchJson2VideoMovie, isJson2VideoConfigured } from "@/lib/providers/json2video";
import { resolveFfmpegPath } from "@/lib/visuals/ffmpeg-path";
import { sceneImagePrompt } from "@/lib/visuals/persist-image";
import { renderRemotionFromStills } from "@/lib/visuals/remotion-fallback";
import { computeScenePlan, distributeSceneDurations } from "@/lib/visuals/scene-count";
import type { VisualAsset, VisualMode } from "@/lib/types/visual";
import { createAdminClient } from "@/lib/supabase/admin";

const execFileAsync = promisify(execFile);

type AssembleInput = {
  assets: VisualAsset[];
  script: string;
  mode: VisualMode;
};

function escapeDrawtext(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").slice(0, 48);
}

async function createFallbackSceneImage(
  ffmpegPath: string,
  label: string,
  index: number,
  outputPath: string
) {
  const colors = ["0x1a2744", "0x2d1b36", "0x1b3a2f", "0x3d2b1a", "0x1a2e3d"];
  const bg = colors[index % colors.length];
  const text = escapeDrawtext(label);
  await execFileAsync(
    ffmpegPath,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${bg}:s=640x360:d=1`,
      "-vf",
      `drawtext=text='${text}':fontsize=18:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.45:boxborderw=8`,
      "-frames:v",
      "1",
      outputPath,
    ],
    { timeout: 15_000 }
  );
}

export const VIDEO_FPS = 8;
const OUTPUT_WIDTH = 960;
const OUTPUT_HEIGHT = 540;
const SOURCE_WIDTH = 960;
const SOURCE_HEIGHT = 540;
const FFMPEG_CONCURRENCY = 4;
const SHORT_CLIP_SECONDS: Record<VisualMode, number> = {
  image: 2.4,
  motion: 3.5,
  video: 3.5,
};

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Alternating pans keep stills from feeling like a static slideshow. */
function kenBurnsFilter(index: number, totalFrames: number) {
  const progress = `on/${Math.max(1, totalFrames - 1)}`;
  const centerX = "(iw-iw/zoom)/2";
  const centerY = "(ih-ih/zoom)/2";

  const patterns = [
    { z: `1.0+0.12*${progress}`, x: centerX, y: centerY },
    { z: `1.12-0.12*${progress}`, x: centerX, y: centerY },
    { z: `1.0+0.12*${progress}`, x: `(iw-iw/zoom)*${progress}`, y: centerY },
    { z: `1.0+0.12*${progress}`, x: centerX, y: `(ih-ih/zoom)*${progress}` },
    { z: `1.12-0.12*${progress}`, x: `(iw-iw/zoom)*(1-${progress})`, y: centerY },
  ];
  const motion = patterns[index % patterns.length];
  return `zoompan=z='${motion.z}':x='${motion.x}':y='${motion.y}':d=1:s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:fps=${VIDEO_FPS}`;
}

function sceneFilterChain(index: number, duration: number, mode: VisualMode) {
  const animate = mode === "motion" || mode === "video";
  const frames = Math.max(2, Math.round(duration * VIDEO_FPS));

  const chain = animate
    ? `scale=${SOURCE_WIDTH}:${SOURCE_HEIGHT}:force_original_aspect_ratio=increase,` +
      `crop=${SOURCE_WIDTH}:${SOURCE_HEIGHT},${kenBurnsFilter(index, frames)}`
    : `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase,` +
      `crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},fps=${VIDEO_FPS},format=yuv420p`;

  return `${chain},setsar=1,format=yuv420p`;
}

async function extendClipToDuration(
  ffmpegPath: string,
  clipPath: string,
  duration: number,
  outputPath: string
) {
  try {
    await execFileAsync(
      ffmpegPath,
      ["-y", "-stream_loop", "-1", "-i", clipPath, "-c", "copy", "-t", duration.toFixed(3), outputPath],
      { timeout: 15_000 }
    );
  } catch {
    await execFileAsync(
      ffmpegPath,
      [
        "-y",
        "-stream_loop",
        "-1",
        "-i",
        clipPath,
        "-t",
        duration.toFixed(3),
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        outputPath,
      ],
      { timeout: 25_000 }
    );
  }
}

/**
 * Encode a short Ken Burns / still clip, then loop with stream copy to fill
 * narration length. zoompan is single-threaded — never encode the full script
 * duration at 12fps.
 */
async function renderScenesInParallel(
  ffmpegPath: string,
  imagePaths: string[],
  durations: number[],
  mode: VisualMode,
  tempDir: string
): Promise<string[]> {
  const encodeSeconds = SHORT_CLIP_SECONDS[mode];

  return mapPool(imagePaths, FFMPEG_CONCURRENCY, async (imagePath, index) => {
    const sceneDuration = durations[index];
    const shortDuration = Math.min(sceneDuration, encodeSeconds);
    const shortPath = join(tempDir, `clip-${index}-short.mp4`);
    const clipPath = join(tempDir, `clip-${index}.mp4`);
    const args = (vf: string, output: string, seconds: number) =>
      [
        "-y",
        "-loop", "1",
        "-framerate", String(VIDEO_FPS),
        "-t", seconds.toFixed(3),
        "-i", imagePath,
        "-vf", vf,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "28",
        "-pix_fmt", "yuv420p",
        "-an",
        output,
      ] as string[];

    try {
      await execFileAsync(ffmpegPath, args(sceneFilterChain(index, shortDuration, mode), shortPath, shortDuration), {
        timeout: 25_000,
        maxBuffer: 20 * 1024 * 1024,
      });
    } catch {
      await execFileAsync(
        ffmpegPath,
        args(`scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},fps=${VIDEO_FPS},format=yuv420p`, shortPath, shortDuration),
        { timeout: 20_000, maxBuffer: 20 * 1024 * 1024 }
      );
    }

    if (sceneDuration <= shortDuration + 0.05) return shortPath;
    await extendClipToDuration(ffmpegPath, shortPath, sceneDuration, clipPath);
    return clipPath;
  });
}

async function concatClips(
  ffmpegPath: string,
  clipPaths: string[],
  tempDir: string,
  outputPath: string
) {
  if (clipPaths.length === 1) {
    await execFileAsync(
      ffmpegPath,
      ["-y", "-i", clipPaths[0], "-c", "copy", "-movflags", "+faststart", outputPath],
      { timeout: 30_000 }
    );
    return outputPath;
  }

  const listPath = join(tempDir, "concat-list.txt");
  const listBody = clipPaths.map((path) => `file '${path.replace(/\\/g, "/")}'`).join("\n");
  await writeFile(listPath, listBody, "utf8");

  await execFileAsync(
    ffmpegPath,
    [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-c", "copy",
      "-movflags", "+faststart",
      outputPath,
    ],
    { timeout: 60_000 }
  );
  return outputPath;
}

async function uploadScenePreview(
  admin: SupabaseClient,
  userId: string,
  projectId: string,
  bytes: Buffer,
  index: number
) {
  const storagePath = `${userId}/${projectId}/scene-${index}-${Date.now()}.jpg`;
  const { error } = await admin.storage.from("visuals").upload(storagePath, bytes, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) return null;
  return admin.storage.from("visuals").getPublicUrl(storagePath).data.publicUrl;
}

async function uploadSceneClip(
  admin: SupabaseClient,
  userId: string,
  projectId: string,
  bytes: Buffer,
  index: number
) {
  const storagePath = `${userId}/${projectId}/scene-${index}-${Date.now()}.mp4`;
  const { error } = await admin.storage.from("visuals").upload(storagePath, bytes, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (error) return null;
  return admin.storage.from("visuals").getPublicUrl(storagePath).data.publicUrl;
}

async function assembleFromVideoClips(
  ffmpegPath: string,
  clipPaths: string[],
  durations: number[],
  tempDir: string
) {
  const scaledPaths = await mapPool(clipPaths, FFMPEG_CONCURRENCY, async (clipPath, i) => {
    const scaled = join(tempDir, `clip-${i}-scaled.mp4`);
    await execFileAsync(
      ffmpegPath,
      [
        "-y",
        "-stream_loop",
        "-1",
        "-i",
        clipPath,
        "-vf",
        `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase,crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},fps=${VIDEO_FPS}`,
        "-t",
        durations[i].toFixed(3),
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        scaled,
      ],
      { timeout: 30_000 }
    );
    return scaled;
  });

  const outputPath = join(tempDir, "assembled.mp4");
  if (scaledPaths.length === 1) {
    await execFileAsync(ffmpegPath, ["-y", "-i", scaledPaths[0], "-c", "copy", outputPath], {
      timeout: 30_000,
    });
    return outputPath;
  }

  const listPath = join(tempDir, "concat.txt");
  const listBody = scaledPaths.map((path) => `file '${path.replace(/\\/g, "/")}'`).join("\n");
  await writeFile(listPath, listBody, "utf8");
  await execFileAsync(
    ffmpegPath,
    ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outputPath],
    { timeout: 60_000 }
  );
  return outputPath;
}

export async function assembleVisualVideo(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  input: AssembleInput
): Promise<{ url: string; durationSeconds: number }> {
  const readyAssets = input.assets
    .filter((asset) => asset.prompt || asset.url)
    .sort((a, b) => a.scene_index - b.scene_index);

  if (!readyAssets.length) {
    throw new Error("No scene visuals to assemble. Generate scenes first.");
  }

  const plan = computeScenePlan(input.script, input.mode);
  const durations = distributeSceneDurations(readyAssets.length, plan.totalDurationSeconds);
  const ffmpegPath = await resolveFfmpegPath();
  const tempDir = await mkdtemp(join(tmpdir(), "reelforge-fast-"));
  const admin = createAdminClient() ?? supabase;

  try {
    const prompts = readyAssets.map((asset) => ({
      prompt: sceneImagePrompt(asset),
      seed: asset.scene_index + 100,
      beat: asset.scene_beat,
    }));

    let outputPath = join(tempDir, "assembled.mp4");
    const sceneStillBytes = await fetchSceneImagesParallel(prompts);
    let sceneVideos: Array<Buffer | null> = readyAssets.map(() => null);

    if (input.mode === "video") {
      sceneVideos = await fetchSceneVideosWithFallback(prompts, sceneStillBytes);

      const writeStill = async (index: number) => {
        const path = join(tempDir, `scene-${index}.jpg`);
        if (sceneStillBytes[index]?.length) {
          await writeFile(path, new Uint8Array(sceneStillBytes[index]!));
        } else {
          const label =
            readyAssets[index].scene_title ||
            readyAssets[index].scene_beat?.slice(0, 40) ||
            `Scene ${index + 1}`;
          await createFallbackSceneImage(ffmpegPath, label, index, path);
        }
        return path;
      };

      if (sceneVideos.some((clip) => clip?.length)) {
        const clipPaths: string[] = [];
        for (let i = 0; i < readyAssets.length; i += 1) {
          if (sceneVideos[i]?.length) {
            const clipPath = join(tempDir, `scene-${i}.mp4`);
            await writeFile(clipPath, new Uint8Array(sceneVideos[i]!));
            clipPaths.push(clipPath);
            continue;
          }
          const imagePath = await writeStill(i);
          const kenBurnsPath = join(tempDir, `scene-${i}-kb.mp4`);
          const encodeSec = Math.min(durations[i], SHORT_CLIP_SECONDS.video);
          const frames = Math.max(8, Math.round(encodeSec * VIDEO_FPS));
          await execFileAsync(
            ffmpegPath,
            [
              "-y",
              "-loop",
              "1",
              "-i",
              imagePath,
              "-vf",
              `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase,crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},zoompan=z='min(zoom+0.0015,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:fps=${VIDEO_FPS}`,
              "-t",
              encodeSec.toFixed(3),
              "-c:v",
              "libx264",
              "-preset",
              "ultrafast",
              "-pix_fmt",
              "yuv420p",
              kenBurnsPath,
            ],
            { timeout: 25_000 }
          );
          clipPaths.push(kenBurnsPath);
        }
        outputPath = await assembleFromVideoClips(ffmpegPath, clipPaths, durations, tempDir);
      } else {
        const imagePaths = await Promise.all(readyAssets.map((_, i) => writeStill(i)));
        try {
          const clipPaths = await renderScenesInParallel(
            ffmpegPath,
            imagePaths,
            durations,
            "video",
            tempDir
          );
          await concatClips(ffmpegPath, clipPaths, tempDir, outputPath);
        } catch {
          const remotion = await renderRemotionFromStills(
            imagePaths,
            durations,
            readyAssets.map((asset, index) => asset.scene_title || `Scene ${index + 1}`)
          );
          if (remotion?.length) {
            await writeFile(outputPath, new Uint8Array(remotion));
          } else if (isJson2VideoConfigured()) {
            const stillUrls = await Promise.all(
              sceneStillBytes.map((bytes, index) =>
                bytes?.length ? uploadScenePreview(admin, userId, projectId, bytes, index) : Promise.resolve(null)
              )
            );
            const movie = await fetchJson2VideoMovie(
              readyAssets.map((asset, index) => ({
                prompt: prompts[index].prompt,
                durationSeconds: durations[index],
                imageUrl: stillUrls[index] || asset.url,
              }))
            );
            if (movie?.length) await writeFile(outputPath, new Uint8Array(movie));
          }
        }
      }
    } else {
      const imagePaths: string[] = [];
      for (let i = 0; i < readyAssets.length; i += 1) {
        const path = join(tempDir, `scene-${i}.jpg`);
        if (sceneStillBytes[i]?.length) {
          await writeFile(path, new Uint8Array(sceneStillBytes[i]!));
        } else {
          const label =
            readyAssets[i].scene_title ||
            readyAssets[i].scene_beat?.slice(0, 40) ||
            `Scene ${i + 1}`;
          await createFallbackSceneImage(ffmpegPath, label, i, path);
        }
        imagePaths.push(path);
      }

      const clipPaths = await renderScenesInParallel(
        ffmpegPath,
        imagePaths,
        durations,
        input.mode,
        tempDir
      );
      await concatClips(ffmpegPath, clipPaths, tempDir, outputPath);
    }

    const videoBytes = await readFile(outputPath);
    const storagePath = `${userId}/${projectId}/assembled-${Date.now()}.mp4`;
    const { error: uploadError } = await admin.storage.from("visuals").upload(storagePath, videoBytes, {
      contentType: "video/mp4",
      upsert: true,
    });

    if (uploadError) throw new Error(`Video upload failed: ${uploadError.message}`);

    const publicUrl = admin.storage.from("visuals").getPublicUrl(storagePath).data.publicUrl;

    await Promise.all(
      readyAssets.map(async (asset, i) => {
        let url = asset.url;
        if (sceneVideos[i]?.length) {
          url = (await uploadSceneClip(admin, userId, projectId, sceneVideos[i]!, i)) ?? url;
        } else if (sceneStillBytes[i]?.length) {
          url = (await uploadScenePreview(admin, userId, projectId, sceneStillBytes[i]!, i)) ?? url;
        }
        return supabase
          .from("visual_assets")
          .update({
            url,
            type: sceneVideos[i]?.length ? "video" : "image",
            mode: input.mode,
          })
          .eq("id", asset.id);
      })
    );

    return { url: publicUrl, durationSeconds: plan.totalDurationSeconds };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
