import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSceneImagesParallel, fetchSceneImage } from "@/lib/providers/image";
import { fetchStockImage } from "@/lib/providers/stock-image";
import { fetchSceneStillsFast } from "@/lib/providers/fast-image-gen";
import type { ImageGenProgressEvent } from "@/lib/providers/fast-image-gen";
import { fetchSceneVideosWithFallback } from "@/lib/providers/scene-video";
import { fetchJson2VideoMovie, isJson2VideoConfigured } from "@/lib/providers/json2video";
import { resolveFfmpegPath } from "@/lib/visuals/ffmpeg-path";
import { sceneImagePrompt } from "@/lib/visuals/persist-image";
import { renderRemotionFromStills } from "@/lib/visuals/remotion-fallback";
import { computeScenePlan, distributeSceneDurations } from "@/lib/visuals/scene-count";
import type { VisualAsset, VisualMode } from "@/lib/types/visual";
import { isUsableStill, visualsStorageClient } from "@/lib/visuals/visuals-storage";

const execFileAsync = promisify(execFile);

type AssembleInput = {
  assets: VisualAsset[];
  script: string;
  mode: VisualMode;
  onImageProgress?: (event: ImageGenProgressEvent) => void | Promise<void>;
};

async function createFallbackSceneImage(
  ffmpegPath: string,
  _label: string,
  index: number,
  outputPath: string
) {
  const colors = ["0x1a2744", "0x2d1b36", "0x1b3a2f", "0x3d2b1a", "0x1a2e3d"];
  const bg = colors[index % colors.length];
  await execFileAsync(
    ffmpegPath,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${bg}:s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:d=1`,
      "-frames:v",
      "1",
      outputPath,
    ],
    { timeout: 3_000 }
  );
}
const OUTPUT_WIDTH = 640;
const OUTPUT_HEIGHT = 360;
export const VIDEO_FPS = 8;
const SOURCE_WIDTH = 640;
const SOURCE_HEIGHT = 360;
const FFMPEG_CONCURRENCY = 8;
const SHORT_CLIP_SECONDS: Record<VisualMode, number> = {
  image: 1.0,
  motion: 1.0,
  video: 2.0,
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
  const base =
    `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase,` +
    `crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},fps=${VIDEO_FPS},format=yuv420p`;

  // Image + motion: scale-only short clips; one stream-loop fills narration length.
  if (mode === "image" || mode === "motion") return `${base},setsar=1`;

  const frames = Math.min(10, Math.max(4, Math.round(Math.min(duration, SHORT_CLIP_SECONDS[mode]) * VIDEO_FPS)));
  const motion = kenBurnsFilter(index, frames);
  return (
    `scale=${SOURCE_WIDTH}:${SOURCE_HEIGHT}:force_original_aspect_ratio=increase,` +
    `crop=${SOURCE_WIDTH}:${SOURCE_HEIGHT},${motion},setsar=1,format=yuv420p`
  );
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

async function renderClipsBatch(
  ffmpegPath: string,
  imagePaths: string[],
  mode: VisualMode,
  tempDir: string
): Promise<string> {
  const encodeSeconds = SHORT_CLIP_SECONDS[mode];
  const outputPath = join(tempDir, "short-assembly.mp4");

  if (imagePaths.length === 1) {
    await renderSingleClip(ffmpegPath, imagePaths[0], 0, mode, tempDir).then((clip) =>
      execFileAsync(ffmpegPath, ["-y", "-i", clip, "-c", "copy", outputPath], { timeout: 10_000 })
    );
    return outputPath;
  }

  const inputArgs: string[] = [];
  const filterParts: string[] = [];
  imagePaths.forEach((imagePath, index) => {
    inputArgs.push(
      "-loop",
      "1",
      "-framerate",
      String(VIDEO_FPS),
      "-t",
      encodeSeconds.toFixed(3),
      "-i",
      imagePath
    );
    filterParts.push(
      `[${index}:v]${sceneFilterChain(index, encodeSeconds, mode)}[v${index}]`
    );
  });
  const concatIn = imagePaths.map((_, index) => `[v${index}]`).join("");
  filterParts.push(`${concatIn}concat=n=${imagePaths.length}:v=1:a=0[outv]`);

  try {
    await execFileAsync(
      ffmpegPath,
      [
        "-y",
        ...inputArgs,
        "-filter_complex",
        filterParts.join(";"),
        "-map",
        "[outv]",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "30",
        "-pix_fmt",
        "yuv420p",
        "-an",
        outputPath,
      ],
      { timeout: 20_000, maxBuffer: 16 * 1024 * 1024 }
    );
  } catch {
    const clipPaths = await mapPool(imagePaths, FFMPEG_CONCURRENCY, (imagePath, index) =>
      renderSingleClip(ffmpegPath, imagePath, index, mode, tempDir)
    );
    await concatClips(ffmpegPath, clipPaths, tempDir, outputPath);
  }

  return outputPath;
}

async function pipelineImageMotionClips(
  ffmpegPath: string,
  prompts: Array<{ prompt: string; seed: number; beat?: string | null }>,
  labels: string[],
  mode: VisualMode,
  tempDir: string,
  onImageProgress?: AssembleInput["onImageProgress"]
): Promise<{ clipPaths: string[]; stillBytes: Array<Buffer | null> }> {
  const stillBytes = await fetchSceneStillsFast(prompts, {
    concurrency: 5,
    onProgress: onImageProgress,
  });
  const imagePaths = await Promise.all(
    prompts.map(async (_, index) => {
      const path = join(tempDir, `scene-${index}.jpg`);
      if (isUsableStill(stillBytes[index])) {
        await writeFile(path, new Uint8Array(stillBytes[index]!));
      } else {
        await createFallbackSceneImage(ffmpegPath, labels[index], index, path);
        // Persist whatever we actually used for the clip (even solid-color fallbacks).
        stillBytes[index] = await readFile(path);
      }
      return path;
    })
  );

  const shortAssembly = await renderClipsBatch(ffmpegPath, imagePaths, mode, tempDir);

  return { clipPaths: [shortAssembly], stillBytes };
}

async function renderSingleClip(
  ffmpegPath: string,
  imageInput: string,
  index: number,
  mode: VisualMode,
  tempDir: string
): Promise<string> {
  const encodeSeconds = SHORT_CLIP_SECONDS[mode];
  const shortPath = join(tempDir, `clip-${index}-short.mp4`);
  const args = (vf: string, output: string, seconds: number) =>
    [
      "-y",
      "-loop",
      "1",
      "-framerate",
      String(VIDEO_FPS),
      "-t",
      seconds.toFixed(3),
      "-i",
      imageInput,
      "-vf",
      vf,
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "30",
      "-pix_fmt",
      "yuv420p",
      "-an",
      output,
    ] as string[];

  try {
    await execFileAsync(
      ffmpegPath,
      args(sceneFilterChain(index, encodeSeconds, mode), shortPath, encodeSeconds),
      { timeout: 14_000, maxBuffer: 12 * 1024 * 1024 }
    );
  } catch {
    await execFileAsync(
      ffmpegPath,
      args(`scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},fps=${VIDEO_FPS},format=yuv420p`, shortPath, encodeSeconds),
      { timeout: 10_000, maxBuffer: 12 * 1024 * 1024 }
    );
  }

  return shortPath;
}

/**
 * Encode a short Ken Burns / still clip, then loop with stream copy to fill
 * narration length. zoompan is single-threaded — never encode the full script
 * duration at 12fps.
 */
async function renderScenesInParallel(
  ffmpegPath: string,
  imagePaths: string[],
  mode: VisualMode,
  tempDir: string
): Promise<string[]> {
  const encodeSeconds = SHORT_CLIP_SECONDS[mode];
  const concurrency = mode === "motion" || mode === "video" ? 4 : FFMPEG_CONCURRENCY;

  return mapPool(imagePaths, concurrency, async (imagePath, index) => {
    const shortPath = join(tempDir, `clip-${index}-short.mp4`);
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
        "-crf", "30",
        "-pix_fmt", "yuv420p",
        "-an",
        output,
      ] as string[];

    try {
      await execFileAsync(
        ffmpegPath,
        args(sceneFilterChain(index, encodeSeconds, mode), shortPath, encodeSeconds),
        { timeout: 12_000, maxBuffer: 12 * 1024 * 1024 }
      );
    } catch {
      await execFileAsync(
        ffmpegPath,
        args(`scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},fps=${VIDEO_FPS},format=yuv420p`, shortPath, encodeSeconds),
        { timeout: 10_000, maxBuffer: 12 * 1024 * 1024 }
      );
    }

    return shortPath;
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
  const storage = visualsStorageClient(supabase);

  let ffmpegWorks = false;
  try {
    await execFileAsync(ffmpegPath, ["-version"], { timeout: 5_000 });
    ffmpegWorks = true;
  } catch {
    ffmpegWorks = false;
  }

  try {
    const prompts = readyAssets.map((asset) => ({
      prompt: sceneImagePrompt(asset),
      seed: asset.scene_index + 100,
      beat: asset.scene_beat,
    }));

    let outputPath = join(tempDir, "assembled.mp4");
    let sceneStillBytes: Array<Buffer | null> = readyAssets.map(() => null);
    let sceneVideos: Array<Buffer | null> = readyAssets.map(() => null);

    // Serverless without ffmpeg: still generate + persist AI stills so Visuals isn't empty.
    if (!ffmpegWorks && (input.mode === "image" || input.mode === "motion")) {
      sceneStillBytes = await fetchSceneStillsFast(prompts, {
        onProgress: input.onImageProgress,
      });
      let firstUrl: string | null = null;
      for (let i = 0; i < readyAssets.length; i += 1) {
        const bytes = sceneStillBytes[i];
        if (!bytes?.length) continue;
        const url = await uploadScenePreview(storage, userId, projectId, bytes, i);
        if (!url) continue;
        if (!firstUrl) firstUrl = url;
        await storage
          .from("visual_assets")
          .update({ url, type: "image", mode: input.mode })
          .eq("id", readyAssets[i].id);
      }
      if (!firstUrl) {
        throw new Error("spawn ffmpeg ENOENT — and no AI stills could be saved.");
      }
      // Stills are persisted; fail assemble so soft-complete can succeed without a fake MP4 URL.
      throw new Error(
        `spawn ffmpeg ENOENT — saved scene stills; MP4 assembly unavailable on this host.`
      );
    }

    if (input.mode === "video") {
      sceneStillBytes = await fetchSceneImagesParallel(prompts);
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
            "video",
            tempDir
          );
          const shortAssembly = join(tempDir, "short-assembly.mp4");
          await concatClips(ffmpegPath, clipPaths, tempDir, shortAssembly);
          await extendClipToDuration(ffmpegPath, shortAssembly, plan.totalDurationSeconds, outputPath);
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
                bytes?.length ? uploadScenePreview(storage, userId, projectId, bytes, index) : Promise.resolve(null)
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
      const labels = readyAssets.map(
        (asset, index) => asset.scene_title || asset.scene_beat?.slice(0, 40) || `Scene ${index + 1}`
      );
      const { clipPaths, stillBytes: pipedStills } = await pipelineImageMotionClips(
        ffmpegPath,
        prompts,
        labels,
        input.mode,
        tempDir,
        input.onImageProgress
      );
      pipedStills.forEach((bytes, index) => {
        if (isUsableStill(bytes)) sceneStillBytes[index] = bytes;
      });
      for (let index = 0; index < readyAssets.length; index += 1) {
        if (isUsableStill(sceneStillBytes[index]) || (sceneStillBytes[index]?.length ?? 0) > 500) continue;
        const recovered =
          (await fetchSceneImage(
            prompts[index].prompt,
            prompts[index].seed + 47,
            prompts[index].beat
          )) ||
          (await fetchStockImage(
            prompts[index].prompt,
            prompts[index].beat,
            8_000,
            prompts[index].seed + 101
          )) ||
          (await fetchStockImage(
            "Great Pyramid of Giza Egypt",
            prompts[index].beat,
            8_000,
            prompts[index].seed + 131
          ));
        if (recovered && recovered.length > 500) {
          sceneStillBytes[index] = recovered;
        } else {
          const fallbackPath = join(tempDir, `recover-${index}.jpg`);
          await createFallbackSceneImage(
            ffmpegPath,
            readyAssets[index].scene_title || `Scene ${index + 1}`,
            index,
            fallbackPath
          );
          sceneStillBytes[index] = await readFile(fallbackPath);
        }
      }
      const shortAssembly = clipPaths[0] ?? join(tempDir, "short-assembly.mp4");
      await extendClipToDuration(ffmpegPath, shortAssembly, plan.totalDurationSeconds, outputPath);
    }

    const videoBytes = await readFile(outputPath);
    const storagePath = `${userId}/${projectId}/assembled-${Date.now()}.mp4`;
    const { error: uploadError } = await storage.storage.from("visuals").upload(storagePath, videoBytes, {
      contentType: "video/mp4",
      upsert: true,
    });

    if (uploadError) throw new Error(`Video upload failed: ${uploadError.message}`);

    const publicUrl = storage.storage.from("visuals").getPublicUrl(storagePath).data.publicUrl;

    // Persist scene URLs sequentially — parallel demo-store updates can drop rows.
    for (let i = 0; i < readyAssets.length; i += 1) {
      const asset = readyAssets[i];
      let url = asset.url;
      if (sceneVideos[i]?.length) {
        url = (await uploadSceneClip(storage, userId, projectId, sceneVideos[i]!, i)) ?? url;
      } else if ((sceneStillBytes[i]?.length ?? 0) > 500) {
        url = (await uploadScenePreview(storage, userId, projectId, sceneStillBytes[i]!, i)) ?? url;
      }
      if (!url) {
        const lastChance =
          (await fetchStockImage(
            "Great Pyramid of Giza Egypt limestone monument",
            prompts[i].beat,
            8_000,
            prompts[i].seed + 300
          )) || null;
        if ((lastChance?.length ?? 0) > 500) {
          url = (await uploadScenePreview(storage, userId, projectId, lastChance!, i)) ?? url;
        }
      }
      if (!url) {
        const fallbackPath = join(tempDir, `persist-fallback-${i}.jpg`);
        await createFallbackSceneImage(
          ffmpegPath,
          asset.scene_title || `Scene ${i + 1}`,
          i,
          fallbackPath
        );
        url = (await uploadScenePreview(storage, userId, projectId, await readFile(fallbackPath), i)) ?? url;
      }
      if (!url) continue;
      const { error } = await storage
        .from("visual_assets")
        .update({
          url,
          type: sceneVideos[i]?.length ? "video" : "image",
          mode: input.mode,
        })
        .eq("id", asset.id);
      if (error) {
        console.error(`Failed to save scene ${i + 1} URL:`, error.message);
      }
    }

    return { url: publicUrl, durationSeconds: plan.totalDurationSeconds };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
