import { chatCompletion, isLlmConfigured } from "@/lib/providers/llm";

const CANDIDATE_COUNT = 4;

export type ThumbnailPromptInput = {
  title?: string | null;
  script?: string | null;
  description?: string | null;
  youtubeTitle?: string | null;
  fromVideo?: boolean;
};

function extractHook(script: string): string {
  const paragraph = script.trim().split(/\n+/).find((line) => line.trim().length > 20);
  return (paragraph ?? script).trim().slice(0, 280);
}

function subjectLine(input: ThumbnailPromptInput): string {
  if (input.description?.trim()) return input.description.trim().slice(0, 280);
  if (input.youtubeTitle?.trim()) return input.youtubeTitle.trim().slice(0, 180);
  if (input.script?.trim()) return extractHook(input.script);
  return (input.title?.trim() && input.title !== "Untitled project" ? input.title : "YouTube video").slice(0, 120);
}

function fallbackPrompts(input: ThumbnailPromptInput): string[] {
  const base = subjectLine(input);
  const videoHint = input.fromVideo ? "inspired by a real video still, photorealistic" : "cinematic";
  return [
    `YouTube thumbnail, ${videoHint} close-up face, ${base}, dramatic lighting, high contrast, saturated colors, no text, 16:9`,
    `YouTube thumbnail, bold editorial photo of ${base}, emotional expression, shallow depth of field, no text, 16:9`,
    `YouTube thumbnail, dynamic action scene, ${base}, motion, vivid orange and teal grading, no text, 16:9`,
    `YouTube thumbnail, minimalist symbolic composition about ${base}, dark background, single glowing subject, no text, 16:9`,
  ];
}

export async function buildThumbnailPrompts(input: ThumbnailPromptInput, count = CANDIDATE_COUNT): Promise<string[]> {
  const subject = subjectLine(input);
  if (!isLlmConfigured()) return fallbackPrompts(input).slice(0, count);

  try {
    const raw = await chatCompletion(
      [
        {
          role: "system",
          content:
            "You are a YouTube thumbnail art director. Return only valid JSON — no markdown fences.",
        },
        {
          role: "user",
          content: `Create ${count} distinct image generation prompts for YouTube thumbnail backgrounds.
Rules:
- 16:9 cinematic compositions
- High contrast, clickable, emotional
- NO text, logos, or watermarks in the image
- Each prompt should feel visually different (portrait, action, symbolic, etc.)
${input.fromVideo ? "- Match the real video subject; photorealistic, not cartoon" : ""}

Subject / description: ${subject}
Project title: ${input.title || "Untitled"}

Return a JSON array of ${count} prompt strings.`,
        },
      ],
      1200
    );

    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Expected prompt array.");

    const prompts = parsed.map(String).map((prompt) => prompt.trim()).filter(Boolean);
    if (prompts.length >= count) return prompts.slice(0, count);
  } catch {
    // Fall through to heuristic prompts when LLM is unavailable or returns invalid JSON.
  }

  return fallbackPrompts(input).slice(0, count);
}

export function deriveThumbnailHeadline(input: ThumbnailPromptInput): string {
  const cleanedTitle = input.title?.trim() ?? "";
  if (cleanedTitle && cleanedTitle.toLowerCase() !== "untitled project") {
    return cleanedTitle.slice(0, 48);
  }
  if (input.youtubeTitle?.trim()) return input.youtubeTitle.trim().slice(0, 48);
  const hook = input.description?.trim() || (input.script ? extractHook(input.script) : "");
  const words = hook.split(/\s+/).slice(0, 6).join(" ");
  return words || "WATCH THIS";
}
