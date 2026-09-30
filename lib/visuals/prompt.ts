/** Build a script-faithful image prompt from narration beat text. */
export function buildSceneImagePrompt(beat: string, title?: string): string {
  const excerpt = (beat.trim() || title?.trim() || "cinematic documentary scene")
    .replace(/\s+/g, " ")
    .slice(0, 320);
  return (
    `Photorealistic cinematic 16:9 documentary still. ` +
    `Depict ONLY what this narration describes — same subjects, place, action, and mood: "${excerpt}". ` +
    `Do not add unrelated objects or scenes. No text, no watermark, no caption, no split-screen.`
  );
}
