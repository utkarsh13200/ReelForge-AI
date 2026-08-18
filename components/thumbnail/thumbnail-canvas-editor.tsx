"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Move } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_THUMBNAIL_OVERLAY,
  type ThumbnailOverlay,
} from "@/lib/types/thumbnail";
import {
  drawThumbnailCanvas,
  exportThumbnailPng,
  THUMBNAIL_HEIGHT,
  THUMBNAIL_WIDTH,
} from "@/lib/thumbnails/render-canvas";

type ThumbnailCanvasEditorProps = {
  imageUrl: string;
  headline: string;
  initialOverlay?: ThumbnailOverlay | null;
  saving?: boolean;
  onSave: (blob: Blob, overlay: ThumbnailOverlay) => Promise<void>;
};

const DISPLAY_SCALE = 0.55;

export function ThumbnailCanvasEditor({
  imageUrl,
  headline,
  initialOverlay,
  saving = false,
  onSave,
}: ThumbnailCanvasEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const draggingRef = useRef(false);
  const [overlay, setOverlay] = useState<ThumbnailOverlay>(
    initialOverlay ?? DEFAULT_THUMBNAIL_OVERLAY(headline)
  );

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawThumbnailCanvas(ctx, imageRef.current, overlay);
  }, [overlay]);

  useEffect(() => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      imageRef.current = image;
      redraw();
    };
    image.src = imageUrl;
  }, [imageUrl, redraw]);

  useEffect(() => {
    redraw();
  }, [overlay, redraw]);

  function updateOverlay(partial: Partial<ThumbnailOverlay>) {
    setOverlay((current) => ({ ...current, ...partial }));
  }

  function canvasPoint(event: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: overlay.x, y: overlay.y };
    const rect = canvas.getBoundingClientRect();
    const scaleX = THUMBNAIL_WIDTH / rect.width;
    const scaleY = THUMBNAIL_HEIGHT / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  async function handleSave() {
    const blob = await exportThumbnailPng(imageUrl, overlay);
    await onSave(blob, overlay);
  }

  async function handleDownload() {
    const blob = await exportThumbnailPng(imageUrl, overlay);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "thumbnail.png";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-3">
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
          <canvas
            ref={canvasRef}
            width={THUMBNAIL_WIDTH}
            height={THUMBNAIL_HEIGHT}
            className="mx-auto block max-w-full cursor-move"
            style={{ width: THUMBNAIL_WIDTH * DISPLAY_SCALE, height: THUMBNAIL_HEIGHT * DISPLAY_SCALE }}
            onMouseDown={(event) => {
              draggingRef.current = true;
              const point = canvasPoint(event);
              updateOverlay({ x: point.x, y: point.y });
            }}
            onMouseMove={(event) => {
              if (!draggingRef.current) return;
              const point = canvasPoint(event);
              updateOverlay({ x: point.x, y: point.y });
            }}
            onMouseUp={() => {
              draggingRef.current = false;
            }}
            onMouseLeave={() => {
              draggingRef.current = false;
            }}
          />
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Move className="h-3.5 w-3.5" />
          Drag on the canvas to reposition headline text.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="space-y-2">
          <Label htmlFor="headline-text">Headline</Label>
          <Input
            id="headline-text"
            value={overlay.text}
            onChange={(event) => updateOverlay({ text: event.target.value.toUpperCase() })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="font-size">Font size ({overlay.fontSize}px)</Label>
          <input
            id="font-size"
            type="range"
            min={36}
            max={120}
            value={overlay.fontSize}
            onChange={(event) => updateOverlay({ fontSize: Number(event.target.value) })}
            className="w-full accent-forge"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="text-color">Text</Label>
            <Input
              id="text-color"
              type="color"
              value={overlay.color}
              onChange={(event) => updateOverlay({ color: event.target.value })}
              className="h-10 cursor-pointer p-1"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stroke-color">Stroke</Label>
            <Input
              id="stroke-color"
              type="color"
              value={overlay.strokeColor}
              onChange={(event) => updateOverlay({ strokeColor: event.target.value })}
              className="h-10 cursor-pointer p-1"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="stroke-width">Stroke width ({overlay.strokeWidth}px)</Label>
          <input
            id="stroke-width"
            type="range"
            min={0}
            max={16}
            value={overlay.strokeWidth}
            onChange={(event) => updateOverlay({ strokeWidth: Number(event.target.value) })}
            className="w-full accent-forge"
          />
        </div>

        <div className="space-y-2">
          <Label>Alignment</Label>
          <div className="flex gap-2">
            {(["left", "center", "right"] as const).map((align) => (
              <Button
                key={align}
                type="button"
                size="sm"
                variant={overlay.align === align ? "default" : "secondary"}
                onClick={() => updateOverlay({ align })}
              >
                {align}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => void handleDownload()}>
            <Download className="mr-2 h-4 w-4" />
            Download PNG
          </Button>
          <Button type="button" disabled={saving} onClick={() => void handleSave()}>
            {saving ? "Saving…" : "Save to project"}
          </Button>
        </div>
      </div>
    </div>
  );
}
