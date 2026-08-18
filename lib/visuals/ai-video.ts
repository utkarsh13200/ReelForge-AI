import { isComfyUiConfigured } from "@/lib/providers/comfyui-config";
import { isFalConfigured } from "@/lib/providers/fal-video";
import { isHuggingFaceConfigured } from "@/lib/providers/huggingface";
import { isJson2VideoConfigured } from "@/lib/providers/json2video";
import { isReplicateConfigured } from "@/lib/providers/replicate";

/** Video mode always has a renderer: Remotion/ffmpeg if cloud T2V is unavailable. */
export function isAiVideoConfigured() {
  return true;
}

export function describeAiVideoProvider() {
  const names: string[] = [];
  if (isFalConfigured()) names.push("Fal.ai");
  if (isReplicateConfigured()) names.push("Replicate");
  if (isHuggingFaceConfigured()) names.push("Hugging Face");
  if (isJson2VideoConfigured()) names.push("JSON2Video");
  if (isComfyUiConfigured()) names.push("ComfyUI");
  names.push("Remotion");
  return names.join(" → ");
}
