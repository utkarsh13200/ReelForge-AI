import { Composition } from "remotion";
import { ReelForgeVideo } from "./ReelForgeVideo";
import { defaultReelForgeVideoProps, type ReelForgeVideoProps } from "./types";
import { EXPORT_FPS, REMOTION_COMPOSITION_ID, getVideoDimensions } from "../lib/export/constants";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id={REMOTION_COMPOSITION_ID}
        component={ReelForgeVideo}
        durationInFrames={EXPORT_FPS * 10}
        fps={EXPORT_FPS}
        width={1920}
        height={1080}
        defaultProps={defaultReelForgeVideoProps}
        calculateMetadata={({ props }) => {
          const timeline = (props as ReelForgeVideoProps).timeline;
          const aspectRatio = timeline?.aspectRatio ?? "16:9";
          const { width, height } = getVideoDimensions(aspectRatio);
          const durationInFrames = Math.max(
            EXPORT_FPS,
            Math.ceil((timeline?.totalDurationSeconds ?? 10) * EXPORT_FPS)
          );
          return { width, height, durationInFrames };
        }}
      />
    </>
  );
};
