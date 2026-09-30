import type { ThumbnailOverlay } from "@/lib/types/thumbnail";

export const THUMBNAIL_WIDTH = 1280;
export const THUMBNAIL_HEIGHT = 720;

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(test).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function paintLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  overlay: ThumbnailOverlay,
  startY: number,
  lineHeight: number
) {
  ctx.lineJoin = "round";
  ctx.lineWidth = overlay.strokeWidth;
  ctx.strokeStyle = overlay.strokeColor;
  ctx.fillStyle = overlay.color;
  ctx.textAlign = overlay.align;
  ctx.textBaseline = "middle";

  lines.forEach((line, index) => {
    const y = startY + index * lineHeight;
    if (overlay.strokeWidth > 0) ctx.strokeText(line, overlay.x, y);
    ctx.fillText(line, overlay.x, y);
  });
}

export function drawThumbnailCanvas(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  overlay: ThumbnailOverlay
) {
  ctx.clearRect(0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);

  if (image?.complete && image.naturalWidth > 0) {
    ctx.drawImage(image, 0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
  }

  const maxWidth = THUMBNAIL_WIDTH - 120;
  const headline = overlay.text?.trim() ?? "";
  const subtext = overlay.subtext?.trim() ?? "";

  ctx.font = `800 ${overlay.fontSize}px Inter, Arial, sans-serif`;
  const headlineLines = wrapLines(ctx, headline, maxWidth);
  const headlineHeight = overlay.fontSize * 1.12;
  paintLines(ctx, headlineLines, overlay, overlay.y, headlineHeight);

  if (subtext) {
    const subSize = Math.max(28, Math.round(overlay.fontSize * 0.42));
    ctx.font = `700 ${subSize}px Inter, Arial, sans-serif`;
    const subLines = wrapLines(ctx, subtext, maxWidth);
    const subStart = overlay.y + headlineLines.length * headlineHeight + subSize * 0.35;
    paintLines(ctx, subLines, { ...overlay, strokeWidth: Math.max(2, overlay.strokeWidth - 2) }, subStart, subSize * 1.15);
  }
}

export async function exportThumbnailPng(
  imageUrl: string,
  overlay: ThumbnailOverlay
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = THUMBNAIL_WIDTH;
  canvas.height = THUMBNAIL_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");

  const image = await loadImage(imageUrl);
  drawThumbnailCanvas(ctx, image, overlay);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not export PNG.");
  return blob;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load thumbnail image."));
    image.src = url;
  });
}
