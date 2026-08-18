import { downloadMedia, isMp4, sleep } from "@/lib/providers/media-bytes";

function json2videoKey() {
  return process.env.JSON2VIDEO_API_KEY?.trim() || process.env.JSON2VIDEO_KEY?.trim() || "";
}

export function isJson2VideoConfigured() {
  return Boolean(json2videoKey());
}

type MovieScene = {
  prompt: string;
  durationSeconds: number;
  imageUrl?: string | null;
};

async function json2videoFetch(path: string, init?: RequestInit) {
  return fetch(`https://api.json2video.com/v2${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "x-api-key": json2videoKey(),
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

export async function fetchJson2VideoMovie(
  scenes: MovieScene[],
  timeoutMs = 90_000
): Promise<Buffer | null> {
  if (!isJson2VideoConfigured() || !scenes.length) return null;

  try {
    const payload = {
      id: `reelforge-${Date.now()}`,
      resolution: "hd",
      quality: "high",
      scenes: scenes.map((scene) => ({
        duration: Math.max(3, Math.round(scene.durationSeconds)),
        elements: [
          scene.imageUrl
            ? {
                type: "image",
                src: scene.imageUrl,
                duration: Math.max(3, Math.round(scene.durationSeconds)),
                zoom: 2,
                resize: "cover",
              }
            : {
                type: "text",
                text: scene.prompt.slice(0, 80),
                duration: Math.max(3, Math.round(scene.durationSeconds)),
                style: "001",
              },
        ],
      })),
    };

    const created = await json2videoFetch("/movies", {
      method: "POST",
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    if (!created.ok) return null;
    const createdJson = (await created.json()) as {
      project?: string;
      id?: string;
      movie?: { id?: string; project?: string };
    };
    const projectId = createdJson.project || createdJson.id || createdJson.movie?.id || createdJson.movie?.project;
    if (!projectId) return null;

    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      await sleep(3000);
      const statusRes = await json2videoFetch(
        `/movies?id=${encodeURIComponent(projectId)}&project=${encodeURIComponent(projectId)}`,
        { signal: AbortSignal.timeout(15_000) }
      );
      if (!statusRes.ok) continue;
      const statusJson = (await statusRes.json()) as {
        movie?: { status?: string; url?: string };
        status?: string;
        url?: string;
      };
      const status = statusJson.movie?.status || statusJson.status;
      const url = statusJson.movie?.url || statusJson.url;
      if ((status === "done" || status === "success") && url) {
        const downloaded = await downloadMedia(url, 60_000);
        if (downloaded && isMp4(downloaded.bytes, downloaded.contentType)) return downloaded.bytes;
      }
      if (status === "error" || status === "failed") return null;
    }
  } catch {
    // next provider
  }
  return null;
}
