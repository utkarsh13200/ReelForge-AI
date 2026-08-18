import type { ThumbnailOverlay } from "@/lib/types/thumbnail";

export const THUMBNAIL_WIDTH = 1280;
export const THUMBNAIL_HEIGHT = 720;

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

  ctx.font = `800 ${overlay.fontSize}px Inter, Arial, sans-serif`;
  ctx.textAlign = overlay.align;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = overlay.strokeWidth;
  ctx.strokeStyle = overlay.strokeColor;
  ctx.fillStyle = overlay.color;
  ctx.strokeText(overlay.text, overlay.x, overlay.y);
  ctx.fillText(overlay.text, overlay.x, overlay.y);
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
