import type { TimelineAspectRatio } from "@/lib/types/timeline";

export function getVideoDimensions(aspectRatio: TimelineAspectRatio) {
  switch (aspectRatio) {
    case "9:16":
      return { width: 1080, height: 1920 };
    case "1:1":
      return { width: 1080, height: 1080 };
    default:
      return { width: 1920, height: 1080 };
  }
}

export const EXPORT_FPS = 30;
export const REMOTION_COMPOSITION_ID = "ReelForgeVideo";
