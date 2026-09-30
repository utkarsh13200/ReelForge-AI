import { chatCompletion, isLlmConfigured, parseJsonArray } from "@/lib/providers/llm";
import type { SceneBeat } from "@/lib/types/visual";
import { computeScenePlan } from "@/lib/visuals/scene-count";
import type { VisualMode } from "@/lib/types/visual";
import { buildSceneImagePrompt } from "@/lib/visuals/prompt";

type RawScene = { title?: string; beat?: string; prompt?: string; scriptExcerpt?: string };

function scriptBeats(script: string): string[] {
  const sentences = script
    .split(/(?<=[.!?])(?:\s+|$)/)
    .map((part) => part.trim())
    .filter((part) => part.length > 20);

  const beats: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length > 160) {
      const clauses = sentence.split(/;\s+|,\s+(?=[A-Z])/).map((part) => part.trim()).filter((part) => part.length > 20);
      if (clauses.length > 1) {
        beats.push(...clauses);
        continue;
      }
    }
    beats.push(sentence);
  }
  return beats.length ? coalesceShortBeats(beats) : [script.trim()].filter(Boolean);
}

function coalesceShortBeats(beats: string[]): string[] {
  const merged: string[] = [];
  for (const beat of beats) {
    const previous = merged[merged.length - 1];
    if (previous && previous.length < 40) {
      merged[merged.length - 1] = `${previous} ${beat}`;
    } else {
      merged.push(beat);
    }
  }
  return merged;
}

function splitInHalf(text: string): [string, string] | null {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 8) return null;
  const mid = Math.floor(words.length / 2);
  const left = words.slice(0, mid).join(" ");
  const right = words.slice(mid).join(" ");
  if (left.length < 12 || right.length < 12) return null;
  return [left, right];
}

function chunkScriptByWords(script: string, count: number): string[] {
  const words = script.trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return Array.from({ length: count }, (_, index) => `Scene ${index + 1}`);
  }
  if (words.length <= count) {
    return Array.from({ length: count }, (_, index) => {
      const start = Math.floor((index * Math.max(words.length - 1, 0)) / count);
      const slice = words.slice(start, Math.min(words.length, start + Math.max(3, 1)));
      return slice.join(" ") || words[start] || script.trim();
    });
  }
  const size = Math.ceil(words.length / count);
  const chunks = Array.from({ length: count }, (_, index) =>
    words.slice(index * size, (index + 1) * size).join(" ")
  );
  const fallback = chunks.find(Boolean) || script.trim();
  return chunks.map((chunk, index) => chunk || fallback || `Scene ${index + 1}`);
}

function expandBeatsToCount(beats: string[], target: number, fallbackScript: string): string[] {
  let units = beats.map((beat) => beat.trim()).filter(Boolean);
  if (!units.length) units = [fallbackScript.trim()].filter(Boolean);
  if (!units.length) return chunkScriptByWords(fallbackScript, target);

  while (units.length < target) {
    let longestIndex = 0;
    for (let index = 1; index < units.length; index += 1) {
      if (units[index].length > units[longestIndex].length) longestIndex = index;
    }
    const parts = splitInHalf(units[longestIndex]);
    if (!parts) return chunkScriptByWords(fallbackScript, target);
    units.splice(longestIndex, 1, parts[0], parts[1]);
  }

  return units.slice(0, target);
}

/** Split script into unique visual beats — one image per sentence group. */
export function splitScriptHeuristic(script: string, maxScenes?: number): SceneBeat[] {
  const cap = maxScenes ?? computeScenePlan(script).sceneCount;
  const units = expandBeatsToCount(scriptBeats(script), cap, script);

  if (!units.length) {
    throw new Error("Add a script in Module 1 before splitting scenes.");
  }

  const groups: string[] = [];
  if (units.length <= cap) {
    groups.push(...units);
  } else {
    const base = Math.floor(units.length / cap);
    let extra = units.length % cap;
    let offset = 0;
    for (let index = 0; index < cap; index += 1) {
      const take = base + (extra > 0 ? 1 : 0);
      if (extra > 0) extra -= 1;
      groups.push(units.slice(offset, offset + take).join(" "));
      offset += take;
    }
  }

  while (groups.length < cap) {
    groups.push(groups[groups.length - 1] || script.trim());
  }

  const scenes = groups.slice(0, cap).map((chunk, index) => {
    const excerpt = chunk.trim().slice(0, 320);
    const title =
      excerpt.split(/[\s,.;:]+/).filter(Boolean).slice(0, 5).join(" ") || `Scene ${index + 1}`;
    return {
      title,
      beat: excerpt,
      prompt: buildSceneImagePrompt(excerpt, title),
    };
  });

  if (scenes.length >= cap) return scenes;
  return chunkScriptByWords(script, cap).map((chunk, index) => {
    const excerpt = chunk.trim().slice(0, 320);
    const title =
      excerpt.split(/[\s,.;:]+/).filter(Boolean).slice(0, 5).join(" ") || `Scene ${index + 1}`;
    return {
      title,
      beat: excerpt,
      prompt: buildSceneImagePrompt(excerpt, title),
    };
  });
}

export async function splitScriptIntoScenes(
  script: string,
  mode: VisualMode = "image",
  maxScenes?: number
): Promise<SceneBeat[]> {
  const trimmed = script.trim();
  if (!trimmed) throw new Error("Add a script in Module 1 before splitting scenes.");

  const sceneCap = maxScenes ?? computeScenePlan(trimmed, mode).sceneCount;

  // Fast path: instant heuristic split (~30s total pipeline target).
  if (process.env.VISUAL_USE_LLM !== "true") {
    return splitScriptHeuristic(trimmed, sceneCap);
  }

  if (!isLlmConfigured()) {
    return splitScriptHeuristic(trimmed, sceneCap);
  }

  try {
    const raw = await chatCompletion(
      [
        {
          role: "system",
          content:
            "You are a visual director for YouTube documentaries. Return only valid JSON — no markdown fences. Every image prompt must depict ONLY what the narration describes at that moment.",
        },
        {
          role: "user",
          content: `Break this narration script into ${sceneCap} visual beats for a 16:9 video.
Each beat must map to a specific portion of the script in order.
Return a JSON array of objects with:
- title (short scene label)
- beat (exact script excerpt or faithful 1-sentence summary of that moment)
- prompt (detailed cinematic image prompt that visually matches the beat — subjects, setting, action must match the narration; no text overlays)

Script:
${trimmed.slice(0, 12000)}`,
        },
      ],
      3000
    );

    let parsed: RawScene[];
    try {
      const cleaned = raw.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned) as RawScene[];
      if (!Array.isArray(parsed)) throw new Error("Not an array");
    } catch {
      parsed = (await parseJsonArray(raw)) as RawScene[];
    }

    const scenes = parsed
      .map((scene, index) => {
        const beat =
          scene.beat?.trim() ||
          scene.scriptExcerpt?.trim() ||
          scene.title?.trim() ||
          "";
        const title = scene.title?.trim() || `Scene ${index + 1}`;
        const prompt =
          scene.prompt?.trim() ||
          buildSceneImagePrompt(beat || title, title);
        return { title, beat: beat || title, prompt };
      })
      .filter((scene) => scene.prompt)
      .slice(0, sceneCap);

    if (scenes.length >= sceneCap) return scenes.slice(0, sceneCap);
  } catch {
    // Fall through to heuristic split.
  }

  return splitScriptHeuristic(trimmed, sceneCap);
}
