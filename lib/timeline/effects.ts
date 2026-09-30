import {
  DEFAULT_TIMELINE_EFFECTS,
  type TimelineEffects,
  type TimelineQuickStyle,
} from "@/lib/types/timeline";

export function normalizeEffects(effects?: TimelineEffects | null): TimelineEffects {
  return {
    brightness: clamp(effects?.brightness ?? DEFAULT_TIMELINE_EFFECTS.brightness, -100, 100),
    contrast: clamp(effects?.contrast ?? DEFAULT_TIMELINE_EFFECTS.contrast, -100, 100),
    gamma: clamp(effects?.gamma ?? DEFAULT_TIMELINE_EFFECTS.gamma, 0.2, 3),
    quickStyle: effects?.quickStyle ?? DEFAULT_TIMELINE_EFFECTS.quickStyle,
  };
}

export function cssFilterFromEffects(effects?: TimelineEffects | null): string {
  const next = normalizeEffects(effects);
  const brightness = 1 + next.brightness / 100;
  const contrast = 1 + next.contrast / 100;
  const parts = [
    `brightness(${brightness.toFixed(3)})`,
    `contrast(${contrast.toFixed(3)})`,
    gammaApprox(next.gamma),
    ...quickStyleFilters(next.quickStyle),
  ].filter(Boolean);
  return parts.join(" ");
}

/** Map UI gamma to an approximate CSS filter chain (browser preview). */
function gammaApprox(gamma: number) {
  if (Math.abs(gamma - 1) < 0.02) return "";
  // Lower gamma darkens midtones; approximate with brightness + contrast.
  if (gamma < 1) {
    return `brightness(${(0.75 + gamma * 0.25).toFixed(3)}) contrast(${(1.05 + (1 - gamma) * 0.2).toFixed(3)})`;
  }
  return `brightness(${(0.9 + gamma * 0.1).toFixed(3)})`;
}

function quickStyleFilters(style: TimelineQuickStyle): string[] {
  switch (style) {
    case "grayscale":
      return ["grayscale(1)"];
    case "high-contrast":
      return ["contrast(1.35)", "saturate(1.1)"];
    case "warm":
      return ["sepia(0.25)", "saturate(1.15)", "hue-rotate(-8deg)"];
    case "cool":
      return ["saturate(1.05)", "hue-rotate(18deg)", "brightness(1.03)"];
    case "vintage":
      return ["sepia(0.45)", "contrast(1.1)", "brightness(0.95)"];
    default:
      return [];
  }
}

/** ffmpeg eq filter fragment for export (brightness/contrast/gamma). */
export function ffmpegEqFromEffects(effects?: TimelineEffects | null): string | null {
  const next = normalizeEffects(effects);
  const brightness = clamp(next.brightness / 100, -1, 1);
  const contrast = clamp(1 + next.contrast / 100, 0.1, 3);
  const gamma = next.gamma;
  const style = next.quickStyle;

  const filters: string[] = [];
  if (Math.abs(brightness) > 0.01 || Math.abs(contrast - 1) > 0.01 || Math.abs(gamma - 1) > 0.02) {
    filters.push(`eq=brightness=${brightness.toFixed(3)}:contrast=${contrast.toFixed(3)}:gamma=${gamma.toFixed(3)}`);
  }
  if (style === "grayscale") filters.push("hue=s=0");
  if (style === "high-contrast") filters.push("eq=contrast=1.35:saturation=1.1");
  if (style === "warm") filters.push("colorbalance=rs=0.12:gs=0.04:bs=-0.08");
  if (style === "cool") filters.push("colorbalance=rs=-0.06:gs=0.02:bs=0.12");
  if (style === "vintage") filters.push("colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131");

  return filters.length ? filters.join(",") : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
