import type { TimelineJson } from "@/lib/types/timeline";

export function validateTimelineForExport(
  timeline: TimelineJson | null | undefined,
  visualVideoUrl?: string | null
) {
  if (!timeline) {
    throw new Error("Timeline is missing. Complete Visuals and Voice before exporting.");
  }

  const readyScenes = timeline.scenes?.filter((scene) => scene.url) ?? [];
  if (!readyScenes.length && !visualVideoUrl) {
    throw new Error("Add visuals in Module 2 before exporting.");
  }
  if (!timeline.voiceTrack?.url) {
    throw new Error("Voice track is missing. Generate voiceover in Module 3.");
  }

  const sceneDuration = readyScenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  return {
    ...timeline,
    scenes: readyScenes,
    totalDurationSeconds: Math.max(
      timeline.totalDurationSeconds || 0,
      timeline.voiceTrack.durationSeconds || 0,
      sceneDuration
    ),
  } satisfies TimelineJson;
}
