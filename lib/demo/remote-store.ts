import { isServerlessRuntime } from "@/lib/runtime/platform";
import type { SerializedDemoStore } from "@/lib/demo/persistence";

const STORE_PATH = "reelforge-demo/store.json";

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

/** Prefer remote durable store on serverless so jobs/assets survive instance hops. */
export function shouldUseRemoteDemoStore() {
  return isServerlessRuntime() && hasRemoteDemoStore();
}

async function loadFromBlob(): Promise<SerializedDemoStore | null> {
  const token = blobToken();
  if (!token) return null;
  try {
    const listRes = await fetch(
      `https://blob.vercel-storage.com?prefix=${encodeURIComponent(STORE_PATH)}&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-api-version": "7",
        },
        cache: "no-store",
      }
    );
    if (!listRes.ok) return null;
    const listed = (await listRes.json()) as { blobs?: Array<{ url: string }> };
    const url = listed.blobs?.[0]?.url;
    if (!url) return null;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as SerializedDemoStore;
  } catch {
    return null;
  }
}

async function saveToBlob(data: SerializedDemoStore): Promise<boolean> {
  const token = blobToken();
  if (!token) return false;
  try {
    const body = JSON.stringify(data);
    const res = await fetch(`https://blob.vercel-storage.com/${STORE_PATH}`, {
      method: "PUT",
      headers: {
        Access: "public",
        Authorization: `Bearer ${token}`,
        "x-api-version": "7",
        "Content-Type": "application/json",
      },
      body,
    });
    return res.ok;
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
  const token = blobToken();
  if (!token) return null;
  const pathname = `reelforge-demo/media/${bucket}/${path}`;
  try {
    const res = await fetch(`https://blob.vercel-storage.com/${pathname}`, {
      method: "PUT",
      headers: {
        Access: "public",
        Authorization: `Bearer ${token}`,
        "x-api-version": "7",
        "Content-Type": contentType,
      },
      body: new Uint8Array(bytes),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { url?: string };
    return json.url ?? null;
  } catch {
    return null;
  }
}
