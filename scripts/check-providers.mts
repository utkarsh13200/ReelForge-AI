/**
 * Reports which image/video providers are actually usable with the current
 * .env.local. Run with: npm run check:providers
 */
import { fetchGeminiImage, getGeminiImageStatus } from "../lib/providers/gemini-image";
import { fetchPollinationsImage } from "../lib/providers/image";
import { fetchStockImage } from "../lib/providers/stock-image";
import { isComfyUiConfigured } from "../lib/providers/comfyui-config";
import { isFalConfigured } from "../lib/providers/fal-video";
import { fetchHuggingFaceImage, isHuggingFaceConfigured } from "../lib/providers/huggingface";
import { isJson2VideoConfigured } from "../lib/providers/json2video";
import { isReplicateConfigured } from "../lib/providers/replicate";

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
  const bytes = await fetchGeminiImage(PROMPT, 30_000);
  const status = getGeminiImageStatus();
  if (bytes) {
    line("Gemini images", true, `${gemini.model} — ${bytes.length} bytes in ${Date.now() - started}ms`);
  } else {
    line("Gemini images", false, status.lastError ?? "no image returned");
  }
}

{
  const started = Date.now();
  const bytes = await fetchPollinationsImage(PROMPT, 42, 30_000);
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

line("Fal.ai video", isFalConfigured(), isFalConfigured() ? "FAL_KEY set" : "not set — next provider will be used");
line("Replicate", isReplicateConfigured(), isReplicateConfigured() ? "REPLICATE_API_TOKEN set" : "not set");
{
  const started = Date.now();
  const bytes = await fetchHuggingFaceImage(PROMPT, 15_000);
  line(
    "Hugging Face image",
    Boolean(bytes),
    bytes ? `${bytes.length} bytes in ${Date.now() - started}ms` : isHuggingFaceConfigured() ? "token set but no image" : "not set"
  );
}
line("JSON2Video", isJson2VideoConfigured(), isJson2VideoConfigured() ? "JSON2VIDEO_API_KEY set" : "not set");
line("ComfyUI video", isComfyUiConfigured(), isComfyUiConfigured() ? "COMFYUI_BASE_URL set" : "not configured");
line("Remotion video", true, "always available as last-resort renderer");

console.log("-".repeat(70) + "\n");
