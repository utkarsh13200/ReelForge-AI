/** Build a script-faithful image prompt from narration beat text. */
export function buildSceneImagePrompt(beat: string, title?: string): string {
  const excerpt = (beat.trim() || title?.trim() || "cinematic documentary scene")
    .replace(/\s+/g, " ")
    .slice(0, 260);
  return `Photorealistic cinematic 16:9 photograph of: ${excerpt}. No text, no watermark, no caption.`;
}
