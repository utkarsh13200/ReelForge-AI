import { existsSync, readFileSync, writeFileSync } from "fs";
import {
  demoMediaFilePath,
  ensureDemoMediaDir,
} from "@/lib/demo/persistence";

type MediaEntry = { bytes: Buffer; contentType: string };

declare global {
  // eslint-disable-next-line no-var
  var __reelforgeDemoMedia: Map<string, MediaEntry> | undefined;
}

function mediaMap() {
  if (!globalThis.__reelforgeDemoMedia) {
    globalThis.__reelforgeDemoMedia = new Map();
  }
  return globalThis.__reelforgeDemoMedia;
}

function mediaKey(bucket: string, path: string) {
  return `${bucket}/${path}`;
}

export function putDemoMedia(bucket: string, path: string, bytes: Buffer, contentType: string) {
  mediaMap().set(mediaKey(bucket, path), { bytes, contentType });
  try {
    const filePath = ensureDemoMediaDir(bucket, path);
    writeFileSync(filePath, new Uint8Array(bytes));
  } catch {
    // In-memory fallback still works for the current session.
  }
}

export function getDemoMedia(bucket: string, path: string) {
  const cached = mediaMap().get(mediaKey(bucket, path));
  if (cached) return cached;

  try {
    const filePath = demoMediaFilePath(bucket, path);
    if (!existsSync(filePath)) return null;
    const bytes = readFileSync(filePath);
    const contentType = path.endsWith(".mp4")
      ? "video/mp4"
      : path.endsWith(".mp3")
        ? "audio/mpeg"
        : path.endsWith(".png")
          ? "image/png"
          : "image/jpeg";
    const entry = { bytes, contentType };
    mediaMap().set(mediaKey(bucket, path), entry);
    return entry;
  } catch {
    return null;
  }
}

export function demoMediaPublicUrl(bucket: string, path: string) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  // Relative URL so scene stills load on whatever host/port the app is using.
  return `/api/demo/media/${bucket}/${encoded}`;
}

export { appOrigin, absolutizeAppUrl } from "@/lib/demo/urls";

/** Read bytes from the local media store when the public URL is a demo path. */
export function readDemoMediaFromUrl(url: string) {
  const pathOnly = url.replace(/^https?:\/\/[^/]+/i, "");
  const match = pathOnly.match(/^\/api\/demo\/media\/([^/]+)\/(.+)$/);
  if (!match) return null;
  const bucket = decodeURIComponent(match[1]);
  const path = match[2].split("/").map(decodeURIComponent).join("/");
  return getDemoMedia(bucket, path);
}

