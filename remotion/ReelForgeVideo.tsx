import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  Video,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { ReelForgeVideoProps } from "./types";
import type { TimelineScene } from "../lib/types/timeline";

function SceneClip({ scene, durationInFrames }: { scene: TimelineScene; durationInFrames: number }) {
  const frame = useCurrentFrame();
  const isVideoClip =
    scene.mode === "video" || scene.url.includes(".mp4") || scene.url.includes("video/mp4");
  const scale =
    !isVideoClip && scene.mode === "motion"
      ? interpolate(frame, [0, durationInFrames], [1, 1.12], { extrapolateRight: "clamp" })
      : 1;
  const translateX =
    !isVideoClip && scene.mode === "motion"
      ? interpolate(frame, [0, durationInFrames], [0, -36], { extrapolateRight: "clamp" })
      : 0;

  return (
    <AbsoluteFill>
      {isVideoClip ? (
        <Video
          src={scene.url}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          muted
        />
      ) : (
        <Img
          src={scene.url}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale}) translateX(${translateX}px)`,
          }}
        />
      )}
    </AbsoluteFill>
  );
}

function CaptionOverlay({ captions }: { captions: NonNullable<ReelForgeVideoProps["timeline"]["captions"]> }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;
  const activeIndex = captions.words.findIndex(
    (word) => currentTime >= word.start && currentTime < word.end
  );
  const windowStart = Math.max(0, activeIndex - 3);
  const windowEnd = Math.min(captions.words.length, activeIndex + 5);
  const visibleWords = captions.words.slice(windowStart, windowEnd);

  const vertical =
    captions.style.position === "top" ? "12%" : captions.style.position === "center" ? "46%" : "82%";

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        padding: "0 64px 96px",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: vertical,
          left: 64,
          right: 64,
          transform: captions.style.position === "center" ? "translateY(-50%)" : undefined,
          textAlign: "center",
          fontFamily: `${captions.style.fontFamily}, Arial, sans-serif`,
          fontSize: captions.style.fontSize,
          lineHeight: 1.15,
          backgroundColor: captions.style.backgroundColor,
          padding: "12px 18px",
          borderRadius: 12,
        }}
      >
        {visibleWords.length ? (
          visibleWords.map((word, index) => {
            const absoluteIndex = windowStart + index;
            const active = captions.style.highlightCurrentWord && absoluteIndex === activeIndex;
            return (
              <span
                key={`${word.word}-${absoluteIndex}`}
                style={{
                  color: active ? "#FFB347" : captions.style.color,
                  fontWeight: active ? 800 : 700,
                  marginRight: 8,
                  textShadow: "0 2px 8px rgba(0,0,0,0.65)",
                }}
              >
                {word.word}
              </span>
            );
          })
        ) : (
          <span style={{ color: captions.style.color, fontWeight: 700 }}> </span>
        )}
      </div>
    </AbsoluteFill>
  );
}

export const ReelForgeVideo: React.FC<ReelForgeVideoProps> = ({ timeline }) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {timeline.scenes.map((scene) => {
        const durationInFrames = Math.max(1, Math.round(scene.durationSeconds * fps));
        const from = Math.max(0, Math.round(scene.startSeconds * fps));
        return (
          <Sequence key={scene.id} from={from} durationInFrames={durationInFrames}>
            <SceneClip scene={scene} durationInFrames={durationInFrames} />
          </Sequence>
        );
      })}

      {timeline.voiceTrack?.url ? <Audio src={timeline.voiceTrack.url} volume={1} /> : null}
      {timeline.music?.url ? <Audio src={timeline.music.url} volume={timeline.music.volume} /> : null}
      {timeline.captions ? <CaptionOverlay captions={timeline.captions} /> : null}
    </AbsoluteFill>
  );
};
