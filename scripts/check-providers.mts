/**
 * Reports which image/video providers are actually usable with the current
 * .env.local. Run with: npm run check:providers
 */
import { fetchGeminiImage, getGeminiImageStatus } from "../lib/providers/gemini-image";
import { fetchPollinationsImage } from "../lib/providers/image";
import { fetchStockImage } from "../lib/providers/stock-image";
import { isComfyUiConfigured } from "../lib/providers/comfyui-config";
import {
  fetchHuggingFaceImage,
  getHuggingFaceImageError,
  isHuggingFaceConfigured,
} from "../lib/providers/huggingface";
import { isJson2VideoConfigured } from "../lib/providers/json2video";

const PROMPT = "Cinematic wide shot of the Egyptian pyramids at Giza, 1920s documentary photograph";

function line(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "[ OK ]" : "[FAIL]"} ${label.padEnd(22)} ${detail}`);
}

console.log("\nReelForge provider check\n" + "-".repeat(70));

const gemini = getGeminiImageStatus();
if (!gemini.configured) {
  line("Gemini images", false, "GEMINI_API_KEY not set");
} else {
  const started = Date.now();
  const bytes = await fetchGeminiImage(PROMPT, 20_000);
  const status = getGeminiImageStatus();
  if (bytes) {
    line("Gemini images", true, `${gemini.model} — ${bytes.length} bytes in ${Date.now() - started}ms`);
  } else {
    line("Gemini images", false, status.lastError ?? "no image returned (quota or model)");
  }
}

{
  const started = Date.now();
  const bytes = await fetchPollinationsImage(PROMPT, 42, 20_000);
  line(
    "Pollinations images",
    Boolean(bytes),
    bytes ? `${bytes.length} bytes in ${Date.now() - started}ms` : "no image (rate limited or down)"
  );
}

{
  const started = Date.now();
  const bytes = await fetchStockImage(PROMPT, "egyptian pyramids giza desert");
  line(
    "Wikimedia stock",
    Boolean(bytes),
    bytes ? `${bytes.length} bytes in ${Date.now() - started}ms` : "no image"
  );
}

{
  const started = Date.now();
  const bytes = await fetchHuggingFaceImage(PROMPT, 12_000);
  line(
    "Hugging Face image",
    Boolean(bytes),
    bytes
      ? `${bytes.length} bytes in ${Date.now() - started}ms`
      : isHuggingFaceConfigured()
        ? getHuggingFaceImageError() ?? "token set but image models are blocked"
        : "not set"
  );
}

{
  const falKey = process.env.FAL_KEY?.trim() || process.env.FAL_API_KEY?.trim() || "";
  if (!falKey) {
    line("Fal.ai", false, "not set");
  } else {
    const res = await fetch("https://fal.run/fal-ai/fast-lightning-sdxl", {
      method: "POST",
      headers: { Authorization: `Key ${falKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: PROMPT, image_size: "landscape_16_9" }),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    line(
      "Fal.ai",
      res.ok,
      res.ok ? "key accepted" : `HTTP ${res.status} ${text.slice(0, 120).replace(/\s+/g, " ")}`
    );
  }
}

{
  const token = process.env.REPLICATE_API_TOKEN?.trim() || "";
  if (!token) {
    line("Replicate", false, "not set");
  } else {
    const res = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait=5",
      },
      body: JSON.stringify({ input: { prompt: PROMPT } }),
      signal: AbortSignal.timeout(12_000),
    });
    const text = await res.text();
    line(
      "Replicate",
      res.ok,
      res.ok ? "key accepted" : `HTTP ${res.status} ${text.slice(0, 120).replace(/\s+/g, " ")}`
    );
  }
}
line("JSON2Video", isJson2VideoConfigured(), isJson2VideoConfigured() ? "JSON2VIDEO_API_KEY set" : "not set");
line("ComfyUI video", isComfyUiConfigured(), isComfyUiConfigured() ? "COMFYUI_BASE_URL set" : "not configured");
line("Remotion / ffmpeg", true, "always available for Image/Motion Ken Burns assembly");

console.log("-".repeat(70) + "\n");
