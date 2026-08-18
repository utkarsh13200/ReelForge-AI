export function comfyBaseUrl() {
  return (process.env.COMFYUI_BASE_URL?.trim() || "http://127.0.0.1:8188").replace(/\/$/, "");
}

/** A reachable server is required; workflow paths alone do not enable ComfyUI. */
export function isComfyUiConfigured() {
  return Boolean(process.env.COMFYUI_BASE_URL?.trim());
}

export function comfyTimeoutMs() {
  return Number(process.env.COMFYUI_TIMEOUT_MS) || 300_000;
}

export function comfyPollIntervalMs() {
  return Number(process.env.COMFYUI_POLL_MS) || 2_000;
}

export async function resolveComfyT2vWorkflowPath() {
  const fromEnv = process.env.COMFYUI_T2V_WORKFLOW?.trim();
  if (fromEnv) return fromEnv;
  const { join } = await import("path");
  return join(process.cwd(), "workflows", "comfyui-t2v.api.json");
}

export async function resolveComfyI2vWorkflowPath() {
  const fromEnv = process.env.COMFYUI_I2V_WORKFLOW?.trim();
  if (fromEnv) return fromEnv;
  const { join } = await import("path");
  return join(process.cwd(), "workflows", "comfyui-i2v.api.json");
}
