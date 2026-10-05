/**
 * Stable provider chain label for UI copy.
 * Do not read server env here — this runs in client components and must match SSR HTML.
 */
export function describeImageProvider() {
  return "Cloudflare → Gemini → Hugging Face → Pollinations";
}
