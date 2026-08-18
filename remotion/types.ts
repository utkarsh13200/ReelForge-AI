import type { TimelineJson } from "../lib/types/timeline";

export type ReelForgeVideoProps = {
  timeline: TimelineJson;
};

export const defaultReelForgeVideoProps: ReelForgeVideoProps = {
  timeline: {
    version: 1,
    aspectRatio: "16:9",
    totalDurationSeconds: 10,
    voiceTrack: null,
    captions: null,
    scenes: [],
    music: null,
  },
};
