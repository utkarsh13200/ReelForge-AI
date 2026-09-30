import type { VisualAsset } from "@/lib/types/visual";
import type { VoiceAsset } from "@/lib/types/voice";
import {
  DEFAULT_CAPTION_STYLE,
  type TimelineJson,
  type TimelineScene,
} from "@/lib/types/timeline";
import { distributeEqualDurations, normalizeTimeline } from "@/lib/timeline/recompute";

function isTimelineJson(value: unknown): value is TimelineJson {
  if (!value || typeof value !== "object") return false;
  const candidate = value as TimelineJson;
  return candidate.version === 1 && Array.isArray(candidate.scenes);
}

function sceneFromAsset(asset: VisualAsset, durationSeconds: number, startSeconds: number): TimelineScene {
  return {
    id: asset.id,
    assetId: asset.id,
    sceneIndex: asset.scene_index,
    title: asset.scene_title || `Scene ${asset.scene_index + 1}`,
    url: asset.url || "",
    mode: asset.mode,
    startSeconds,
    durationSeconds,
  };
}

export function buildDefaultTimeline(
  visualAssets: VisualAsset[],
  voiceAsset: VoiceAsset | null,
  existing: unknown | null,
  assembledVideoUrl?: string | null
): TimelineJson {
  const readyAssets = visualAssets
    .filter((asset) => asset.url)
    .sort((a, b) => a.scene_index - b.scene_index);

  const voiceDuration = Number(voiceAsset?.duration_seconds) || readyAssets.length * 5 || 30;
  const sceneCount = readyAssets.length || (assembledVideoUrl ? 1 : 0);
  const durations = distributeEqualDurations(sceneCount, voiceDuration);

  let scenes = readyAssets.map((asset, index) =>
    sceneFromAsset(asset, durations[index] ?? 5, 0)
  );

  if (!scenes.length && assembledVideoUrl) {
    scenes = [
      {
        id: "project-video",
        assetId: "project-video",
        sceneIndex: 0,
        title: "Project video",
        url: assembledVideoUrl,
        mode: "video",
        startSeconds: 0,
        durationSeconds: voiceDuration,
      },
    ];
  }

  let aspectRatio: TimelineJson["aspectRatio"] = "16:9";
  let music = null;
  let effects = null;
  let captionStyle = DEFAULT_CAPTION_STYLE;

  if (isTimelineJson(existing)) {
    aspectRatio = existing.aspectRatio;
    music = existing.music;
    effects = existing.effects ?? null;
    captionStyle = existing.captions?.style ?? DEFAULT_CAPTION_STYLE;

    const existingByAsset = new Map(existing.scenes.map((scene) => [scene.assetId, scene]));
    scenes = scenes.map((scene) => {
      const saved = existingByAsset.get(scene.assetId);
      if (!saved) return scene;
      return {
        ...scene,
        durationSeconds: saved.durationSeconds,
        mode: saved.mode,
        url: scene.url || saved.url,
      };
    });

    const savedOrder = existing.scenes.map((scene) => scene.assetId);
    scenes.sort((a, b) => savedOrder.indexOf(a.assetId) - savedOrder.indexOf(b.assetId));
  }

  const words = voiceAsset?.word_timestamps_json ?? [];

  const timeline: TimelineJson = {
    version: 1,
    aspectRatio,
    totalDurationSeconds: voiceDuration,
    voiceTrack: voiceAsset?.audio_url
      ? { url: voiceAsset.audio_url, durationSeconds: voiceDuration }
      : null,
    captions: words.length
      ? { words, style: captionStyle }
      : voiceAsset?.audio_url
        ? { words: [], style: captionStyle }
        : null,
    scenes,
    music,
    effects,
  };

  return normalizeTimeline(timeline);
}

export function mergeTimelineAssets(
  timeline: TimelineJson,
  visualAssets: VisualAsset[],
  voiceAsset: VoiceAsset | null
): TimelineJson {
  const assetMap = new Map(visualAssets.map((asset) => [asset.id, asset]));
  const scenes = timeline.scenes
    .map((scene) => {
      const asset = assetMap.get(scene.assetId);
      if (!asset?.url) return scene.url ? scene : null;
      return {
        ...scene,
        url: asset.url,
        title: asset.scene_title || scene.title,
        mode: scene.mode ?? asset.mode,
      };
    })
    .filter((scene): scene is TimelineScene => Boolean(scene));

  const fresh = buildDefaultTimeline(visualAssets, voiceAsset, null);
  const mergedScenes = scenes.length ? scenes : fresh.scenes;

  return normalizeTimeline({
    ...timeline,
    voiceTrack: voiceAsset?.audio_url
      ? {
          url: voiceAsset.audio_url,
          durationSeconds: Number(voiceAsset.duration_seconds) || timeline.totalDurationSeconds,
        }
      : timeline.voiceTrack,
    captions: voiceAsset?.word_timestamps_json?.length
      ? {
          words: voiceAsset.word_timestamps_json,
          style: timeline.captions?.style ?? DEFAULT_CAPTION_STYLE,
        }
      : timeline.captions,
    scenes: mergedScenes,
    effects: timeline.effects ?? null,
  });
}
