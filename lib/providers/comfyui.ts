import { readFile } from "fs/promises";
import {
  comfyBaseUrl,
  comfyPollIntervalMs,
  comfyTimeoutMs,
  isComfyUiConfigured,
  resolveComfyI2vWorkflowPath,
  resolveComfyT2vWorkflowPath,
} from "@/lib/providers/comfyui-config";

export { isComfyUiConfigured } from "@/lib/providers/comfyui-config";

export type ComfyWorkflow = Record<
  string,
  {
    inputs: Record<string, unknown>;
    class_type: string;
    _meta?: { title?: string };
  }
>;

export type ComfyOutputFile = {
  filename: string;
  subfolder: string;
  type: string;
};

type ComfyHistoryEntry = {
  status?: { completed?: boolean; status_str?: string };
  outputs?: Record<string, { gifs?: ComfyOutputFile[]; images?: ComfyOutputFile[]; videos?: ComfyOutputFile[] }>;
};

function baseUrl() {
  return comfyBaseUrl();
}

async function comfyFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  return response;
}

export async function comfyHealthCheck(): Promise<boolean> {
  try {
    const response = await comfyFetch("/system_stats", { signal: AbortSignal.timeout(5_000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function resolveWorkflowPath() {
  return resolveComfyT2vWorkflowPath();
}

export async function loadComfyWorkflow(): Promise<ComfyWorkflow | null> {
  try {
    const path = await resolveWorkflowPath();
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as ComfyWorkflow;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Patch positive/negative prompts and seed into an API-format ComfyUI workflow. */
export function patchComfyWorkflow(
  workflow: ComfyWorkflow,
  prompt: string,
  seed: number,
  negativePrompt = "blurry, low quality, watermark, text overlay, distorted"
): ComfyWorkflow {
  const cloned = structuredClone(workflow) as ComfyWorkflow;
  const encoders = Object.entries(cloned).filter(([, node]) => node.class_type === "CLIPTextEncode");

  if (encoders.length >= 1) {
    encoders[0][1].inputs.text = prompt;
  }
  if (encoders.length >= 2) {
    encoders[1][1].inputs.text = negativePrompt;
  }

  for (const [, node] of Object.entries(cloned)) {
    const inputs = node.inputs;
    if ("seed" in inputs && typeof inputs.seed === "number") inputs.seed = seed;
    if ("noise_seed" in inputs && typeof inputs.noise_seed === "number") inputs.noise_seed = seed;
    if (typeof inputs.text === "string" && inputs.text.includes("{{PROMPT}}")) {
      inputs.text = String(inputs.text).replace(/\{\{PROMPT\}\}/g, prompt);
    }
    if (typeof inputs.text === "string" && inputs.text.includes("{{NEGATIVE}}")) {
      inputs.text = String(inputs.text).replace(/\{\{NEGATIVE\}\}/g, negativePrompt);
    }
  }

  return cloned;
}

export async function queueComfyWorkflow(workflow: ComfyWorkflow): Promise<string> {
  const clientId = `reelforge-${Date.now()}`;
  const response = await comfyFetch("/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`ComfyUI queue failed (${response.status}): ${detail.slice(0, 240)}`);
  }

  const json = (await response.json()) as { prompt_id?: string; error?: string };
  if (json.error) throw new Error(json.error);
  if (!json.prompt_id) throw new Error("ComfyUI did not return a prompt_id.");
  return json.prompt_id;
}

function collectOutputFiles(entry: ComfyHistoryEntry): ComfyOutputFile[] {
  const files: ComfyOutputFile[] = [];
  for (const output of Object.values(entry.outputs ?? {})) {
    files.push(...(output.videos ?? []), ...(output.gifs ?? []), ...(output.images ?? []));
  }
  return files;
}

export async function waitForComfyOutputs(promptId: string): Promise<ComfyOutputFile[]> {
  const deadline = Date.now() + comfyTimeoutMs();

  while (Date.now() < deadline) {
    const response = await comfyFetch(`/history/${promptId}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      await new Promise((resolve) => setTimeout(resolve, comfyPollIntervalMs()));
      continue;
    }

    const history = (await response.json()) as Record<string, ComfyHistoryEntry>;
    const entry = history[promptId];
    if (!entry) {
      await new Promise((resolve) => setTimeout(resolve, comfyPollIntervalMs()));
      continue;
    }

    const files = collectOutputFiles(entry);
    const done = entry.status?.completed || files.length > 0;
    if (done && files.length) return files;
    if (entry.status?.status_str === "error") {
      throw new Error("ComfyUI workflow failed.");
    }

    await new Promise((resolve) => setTimeout(resolve, comfyPollIntervalMs()));
  }

  throw new Error("ComfyUI timed out waiting for video output.");
}

export async function downloadComfyFile(file: ComfyOutputFile): Promise<Buffer> {
  const params = new URLSearchParams({
    filename: file.filename,
    subfolder: file.subfolder ?? "",
    type: file.type ?? "output",
  });
  const response = await comfyFetch(`/view?${params.toString()}`, {
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`ComfyUI download failed (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

export async function uploadComfyImage(filename: string, bytes: Buffer): Promise<string> {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(bytes)], { type: "image/png" }), filename);
  form.append("overwrite", "true");

  const response = await comfyFetch("/upload/image", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`ComfyUI image upload failed (${response.status}).`);
  }

  const json = (await response.json()) as { name?: string };
  if (!json.name) throw new Error("ComfyUI upload did not return a filename.");
  return json.name;
}

async function loadI2vWorkflowPath() {
  return resolveComfyI2vWorkflowPath();
}

async function loadI2vWorkflow(): Promise<ComfyWorkflow | null> {
  try {
    const path = await loadI2vWorkflowPath();
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as ComfyWorkflow;
  } catch {
    return null;
  }
}

/** Patch LoadImage node for img2vid workflows. */
export function patchComfyI2vWorkflow(workflow: ComfyWorkflow, imageName: string, seed: number) {
  const cloned = structuredClone(workflow) as ComfyWorkflow;
  for (const [, node] of Object.entries(cloned)) {
    if (node.class_type === "LoadImage" && "image" in node.inputs) {
      node.inputs.image = imageName;
    }
    if ("seed" in node.inputs && typeof node.inputs.seed === "number") node.inputs.seed = seed;
    if ("noise_seed" in node.inputs && typeof node.inputs.noise_seed === "number") {
      node.inputs.noise_seed = seed;
    }
  }
  return cloned;
}

export async function generateComfyTextToVideo(prompt: string, seed: number): Promise<Buffer | null> {
  if (!isComfyUiConfigured()) return null;

  const online = await comfyHealthCheck();
  if (!online) return null;

  const workflow = await loadComfyWorkflow();
  if (!workflow) return null;

  const patched = patchComfyWorkflow(workflow, prompt, seed);
  const promptId = await queueComfyWorkflow(patched);
  const outputs = await waitForComfyOutputs(promptId);
  const videoFile =
    outputs.find((file) => file.filename.endsWith(".mp4") || file.filename.endsWith(".webm")) ??
    outputs[0];
  if (!videoFile) return null;
  return downloadComfyFile(videoFile);
}

export async function generateComfyImageToVideo(
  imageBytes: Buffer,
  seed: number,
  filename = "reelforge-scene.png"
): Promise<Buffer | null> {
  if (!isComfyUiConfigured()) return null;

  const online = await comfyHealthCheck();
  if (!online) return null;

  const workflow = await loadI2vWorkflow();
  if (!workflow) return null;

  const uploadedName = await uploadComfyImage(filename, imageBytes);
  const patched = patchComfyI2vWorkflow(workflow, uploadedName, seed);
  const promptId = await queueComfyWorkflow(patched);
  const outputs = await waitForComfyOutputs(promptId);
  const videoFile =
    outputs.find((file) => file.filename.endsWith(".mp4") || file.filename.endsWith(".webm")) ??
    outputs[0];
  if (!videoFile) return null;
  return downloadComfyFile(videoFile);
}

export type SceneVideoRequest = {
  prompt: string;
  seed: number;
  imageBytes?: Buffer | null;
};

/** Generate scene clips via ComfyUI (text-to-video, or image-to-video when imageBytes provided). */
export async function fetchSceneVideosParallel(
  items: SceneVideoRequest[]
): Promise<Array<Buffer | null>> {
  return Promise.all(
    items.map(async (item) => {
      try {
        if (item.imageBytes?.length) {
          const i2v = await generateComfyImageToVideo(item.imageBytes, item.seed);
          if (i2v) return i2v;
        }
        return await generateComfyTextToVideo(item.prompt, item.seed);
      } catch {
        return null;
      }
    })
  );
}
