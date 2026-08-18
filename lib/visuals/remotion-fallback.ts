import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { renderProjectVideo } from "@/lib/export/render-video";
import type { TimelineJson, TimelineScene } from "@/lib/types/timeline";

export async function renderRemotionFromStills(
  imagePaths: string[],
  durations: number[],
  titles: string[]
): Promise<Buffer | null> {
  if (!imagePaths.length) return null;

  let start = 0;
  const scenes: TimelineScene[] = [];
  for (let index = 0; index < imagePaths.length; index += 1) {
    const durationSeconds = Math.max(1, durations[index] ?? 5);
    const bytes = await readFile(imagePaths[index]);
    scenes.push({
      id: `remotion-${index}`,
      assetId: `remotion-${index}`,
      sceneIndex: index,
      title: titles[index] || `Scene ${index + 1}`,
      url: `data:image/jpeg;base64,${bytes.toString("base64")}`,
      mode: "motion" as const,
      startSeconds: start,
      durationSeconds,
    });
    start += durationSeconds;
  }

  const timeline: TimelineJson = {
    version: 1,
    aspectRatio: "16:9",
    totalDurationSeconds: start,
    voiceTrack: null,
    captions: null,
    scenes,
    music: null,
  };

  try {
    return await renderProjectVideo(timeline);
  } catch {
    return null;
  }
}

export async function writeStillFiles(
  tempDir: string,
  stills: Array<Buffer | null>,
  labels: string[],
  writeFallback: (label: string, index: number, outputPath: string) => Promise<void>
) {
  const paths: string[] = [];
  for (let index = 0; index < stills.length; index += 1) {
    const path = join(tempDir, `still-${index}.jpg`);
    if (stills[index]?.length) {
      await writeFile(path, new Uint8Array(stills[index]!));
    } else {
      await writeFallback(labels[index] || `Scene ${index + 1}`, index, path);
    }
    paths.push(path);
  }
  return paths;
}
