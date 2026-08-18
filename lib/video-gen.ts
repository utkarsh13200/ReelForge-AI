import type { VisualMode } from "@/lib/types/visual";
import { computeScenePlan } from "@/lib/visuals/scene-count";
import { describeImageProvider } from "@/lib/providers/image";

export function resolveMotionRenderMode(mode: VisualMode) {
  if (mode === "video") return "video_clip";
  return mode === "motion" ? "ken_burns" : "still";
}

/** Countdown while AI stills or video clips generate from the current script. */
export function estimateVisualPipelineSeconds(_script: string, mode: VisualMode): number {
  if (mode === "video") return 22;
  return 10;
}

export function motionRenderNote(mode: VisualMode) {
  if (mode === "video") {
    return "Text-to-video with automatic fallback: Fal.ai → Replicate → Hugging Face → JSON2Video → Remotion.";
  }
  if (mode === "motion") {
    return `Ken Burns motion on ${describeImageProvider()} for each script scene.`;
  }
  return `${describeImageProvider()} for each script scene.`;
}

export const VISUAL_MODE_LABELS: Record<VisualMode, string> = {
  image: "AI Image",
  motion: "Motion",
  video: "Video",
};

export function formatVideoDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return "0:00";
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function formatCountdown(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  if (minutes <= 0) return `${remainder}s`;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function describeScenePlan(script: string, mode: VisualMode) {
  const plan = computeScenePlan(script, mode);
  return `${plan.sceneCount} scenes · ${formatVideoDuration(plan.totalDurationSeconds)} video · ~${Math.round(plan.secondsPerScene)}s each`;
}
