/**
 * Client-safe provider labels (env checks only — no server SDKs).
 * Server-only secrets are omitted from the browser bundle, so the UI label
 * always includes the free defaults; configured keys appear during SSR/API.
 */
export function describeImageProvider() {
  const parts: string[] = [];
  if (process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_2 || process.env.GEMINI_API_KEYS) {
    parts.push("Gemini");
  }
  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) {
    parts.push("Cloudflare Workers AI");
  }
  if (process.env.PUTER_AUTH_TOKEN || process.env.PUTER_API_TOKEN) {
    parts.push("Puter.js");
  }
  if (process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY) {
    parts.push("Hugging Face");
  }
  parts.push("Pollinations");
  if (process.env.AI_HORDE_DISABLED !== "true") parts.push("AI Horde");
  return parts.join(" → ");
}
