import { list, put } from "@vercel/blob";
import type { SerializedDemoStore } from "@/lib/demo/persistence";
import { isServerlessRuntime } from "@/lib/runtime/platform";

const STORE_PATHNAME = "reelforge-demo/store.json";

function blobToken() {
  return (process.env.BLOB_READ_WRITE_TOKEN || "").trim();
}

function upstashUrl() {
  return (process.env.UPSTASH_REDIS_REST_URL || "").trim();
}

function upstashToken() {
  return (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
}

export function hasRemoteDemoStore() {
  return Boolean(blobToken() || (upstashUrl() && upstashToken()));
}

/**
 * Use durable remote store whenever a backend is configured.
 * On Vercel this is required so projects/jobs survive instance hops.
 */
export function shouldUseRemoteDemoStore() {
  if (!hasRemoteDemoStore()) return false;
  return (
    isServerlessRuntime() ||
    process.env.FORCE_REMOTE_DEMO_STORE === "true" ||
    process.env.VERCEL === "1"
  );
}

async function loadFromBlob(): Promise<SerializedDemoStore | null> {
  if (!blobToken()) return null;
  try {
    const listed = await list({
      prefix: STORE_PATHNAME,
      limit: 1,
      token: blobToken(),
    });
    const url = listed.blobs[0]?.url;
    if (!url) return null;
    // Public blob URLs are CDN-cached — bust so overwrites are visible immediately.
    const bust = url.includes("?")
      ? `${url}&t=${Date.now()}`
      : `${url}?t=${Date.now()}`;
    const res = await fetch(bust, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!res.ok) return null;
    return (await res.json()) as SerializedDemoStore;
  } catch {
    return null;
  }
}

async function saveToBlob(data: SerializedDemoStore): Promise<boolean> {
  if (!blobToken()) return false;
  try {
    await put(STORE_PATHNAME, JSON.stringify(data), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      token: blobToken(),
    });
    return true;
  } catch {
    return false;
  }
}

async function loadFromUpstash(): Promise<SerializedDemoStore | null> {
  const url = upstashUrl();
  const token = upstashToken();
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/get/reelforge:demo:store`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: string | null };
    if (!json.result) return null;
    return JSON.parse(json.result) as SerializedDemoStore;
  } catch {
    return null;
  }
}

async function saveToUpstash(data: SerializedDemoStore): Promise<boolean> {
  const url = upstashUrl();
  const token = upstashToken();
  if (!url || !token) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["SET", "reelforge:demo:store", JSON.stringify(data)]),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function loadRemoteDemoStore(): Promise<SerializedDemoStore | null> {
  if (!hasRemoteDemoStore()) return null;
  if (blobToken()) {
    const fromBlob = await loadFromBlob();
    if (fromBlob) return fromBlob;
  }
  return loadFromUpstash();
}

export async function saveRemoteDemoStore(data: SerializedDemoStore): Promise<void> {
  if (!hasRemoteDemoStore()) return;
  if (blobToken()) {
    const ok = await saveToBlob(data);
    if (ok) return;
  }
  await saveToUpstash(data);
}

/** Upload bytes to Blob; returns public URL or null. */
export async function uploadRemoteMedia(
  bucket: string,
  path: string,
  bytes: Buffer,
  contentType: string
): Promise<string | null> {
  if (!blobToken()) return null;
  const pathname = `reelforge-demo/media/${bucket}/${path}`;
  try {
    const result = await put(pathname, bytes, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
      token: blobToken(),
    });
    return result.url;
  } catch {
    return null;
  }
}
