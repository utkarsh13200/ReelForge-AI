import { existsSync, readFileSync, writeFileSync } from "fs";
import {
  demoMediaFilePath,
  ensureDemoMediaDir,
} from "@/lib/demo/persistence";
import { isServerlessRuntime } from "@/lib/runtime/platform";

type MediaEntry = { bytes: Buffer; contentType: string; remoteUrl?: string };

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
  const entry: MediaEntry = { bytes, contentType };
  mediaMap().set(mediaKey(bucket, path), entry);
  try {
    const filePath = ensureDemoMediaDir(bucket, path);
    writeFileSync(filePath, new Uint8Array(bytes));
  } catch {
    // In-memory fallback still works for the current session.
  }
}

export function setDemoMediaRemoteUrl(bucket: string, path: string, remoteUrl: string) {
  const current = mediaMap().get(mediaKey(bucket, path));
  if (current) current.remoteUrl = remoteUrl;
  else mediaMap().set(mediaKey(bucket, path), { bytes: Buffer.alloc(0), contentType: "application/octet-stream", remoteUrl });
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
  const cached = mediaMap().get(mediaKey(bucket, path));
  if (cached?.remoteUrl) return cached.remoteUrl;

  // On serverless without shared FS, embed small media so img/audio tags work
  // even when a later request hits a different instance.
  if (isServerlessRuntime() && cached?.bytes?.length && cached.bytes.length < 900_000) {
    return `data:${cached.contentType};base64,${cached.bytes.toString("base64")}`;
  }

  const encoded = path.split("/").map(encodeURIComponent).join("/");
  // Relative URL so scene stills load on whatever host/port the app is using.
  return `/api/demo/media/${bucket}/${encoded}`;
}

export { appOrigin, absolutizeAppUrl } from "@/lib/demo/urls";

/** Read bytes from the local media store when the public URL is a demo path. */
export function readDemoMediaFromUrl(url: string) {
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    return {
      bytes: Buffer.from(match[2], "base64"),
      contentType: match[1],
    };
  }
  const pathOnly = url.replace(/^https?:\/\/[^/]+/i, "");
  const match = pathOnly.match(/^\/api\/demo\/media\/([^/]+)\/(.+)$/);
  if (!match) return null;
  const bucket = decodeURIComponent(match[1]);
  const path = match[2].split("/").map(decodeURIComponent).join("/");
  return getDemoMedia(bucket, path);
}
