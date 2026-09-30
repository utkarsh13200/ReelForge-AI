import { countWords } from "@/lib/script/utils";
import type { VisualMode } from "@/lib/types/visual";

/** Image/Motion production: exactly 5 script-matched stills in a 1-minute silent preview. */
export const PRODUCTION_SCENE_COUNT = 5;
export const PRODUCTION_DURATION_SECONDS = 60;

/** Legacy caps for video mode and other callers. */
export const FAST_MAX_SCENES = 8;
export const FAST_MIN_SCENES = 7;

/** Target seconds per scene — video mode only (image/motion use fixed 5 × 12s). */
export const SECONDS_PER_SCENE: Record<VisualMode, number> = {
  image: 12,
  motion: 12,
  video: 6,
};

/** Estimated narration duration at ~150 words/minute. */
export function estimateScriptDurationSeconds(script: string): number {
  const words = countWords(script);
  return Math.max(15, Math.round((words / 150) * 60));
}

export type ScenePlan = {
  sceneCount: number;
  totalDurationSeconds: number;
  secondsPerScene: number;
};

/** Scene count follows the script; video length still matches narration. */
export function computeScenePlan(script: string, mode: VisualMode = "image"): ScenePlan {
  if (mode === "image" || mode === "motion") {
    return {
      sceneCount: PRODUCTION_SCENE_COUNT,
      totalDurationSeconds: PRODUCTION_DURATION_SECONDS,
      secondsPerScene: PRODUCTION_DURATION_SECONDS / PRODUCTION_SCENE_COUNT,
    };
  }

  const totalDurationSeconds = estimateScriptDurationSeconds(script);
  const targetPerScene = SECONDS_PER_SCENE[mode];
  const ideal = Math.round(totalDurationSeconds / targetPerScene);
  const sceneCount = Math.max(FAST_MIN_SCENES, Math.min(FAST_MAX_SCENES, ideal || FAST_MIN_SCENES));
  const secondsPerScene = totalDurationSeconds / sceneCount;
  return { sceneCount, totalDurationSeconds, secondsPerScene };
}

export function computeSceneCount(script: string, mode: VisualMode = "image"): number {
  return computeScenePlan(script, mode).sceneCount;
}

export function distributeSceneDurations(sceneCount: number, totalSeconds: number): number[] {
  if (sceneCount <= 0) return [];
  const each = Math.max(1, totalSeconds / sceneCount);
  return Array.from({ length: sceneCount }, () => each);
}
