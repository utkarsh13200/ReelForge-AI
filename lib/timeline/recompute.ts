import type { TimelineJson, TimelineScene } from "@/lib/types/timeline";

export function recomputeSceneTiming(scenes: TimelineScene[]): TimelineScene[] {
  let cursor = 0;
  return scenes.map((scene) => {
    const duration = Math.max(0.5, scene.durationSeconds);
    const next = { ...scene, startSeconds: cursor, durationSeconds: duration };
    cursor += duration;
    return next;
  });
}

export function getTimelineDuration(timeline: Pick<TimelineJson, "scenes" | "voiceTrack">): number {
  const sceneTotal = timeline.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  const voiceTotal = timeline.voiceTrack?.durationSeconds ?? 0;
  return Math.max(sceneTotal, voiceTotal, 1);
}

export function normalizeTimeline(timeline: TimelineJson): TimelineJson {
  const scenes = recomputeSceneTiming(timeline.scenes);
  return {
    ...timeline,
    scenes,
    totalDurationSeconds: getTimelineDuration({ scenes, voiceTrack: timeline.voiceTrack }),
  };
}

export function distributeEqualDurations(sceneCount: number, totalSeconds: number): number[] {
  if (sceneCount <= 0) return [];
  const each = Math.max(0.5, totalSeconds / sceneCount);
  return Array.from({ length: sceneCount }, () => each);
}
