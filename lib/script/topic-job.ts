import { chatCompletion, parseJsonArray } from "@/lib/providers/llm";
import type { ScriptTopicJobPayload } from "@/lib/types/project";
import { countWords } from "@/lib/script/utils";

const SECTION_COUNT = 9;

function toneLabel(payload: ScriptTopicJobPayload) {
  if (payload.tone === "others" && payload.customTone?.trim()) return payload.customTone.trim();
  if (payload.tone === "others") return "custom / flexible";
  return payload.tone;
}

export function createTopicJobPayload(input: {
  projectId: string;
  topic: string;
  tone: string;
  customTone?: string;
  duration: string;
  targetWords: number;
}): ScriptTopicJobPayload {
  return {
    kind: "script_topic",
    projectId: input.projectId,
    topic: input.topic,
    tone: input.tone,
    customTone: input.customTone,
    duration: input.duration,
    targetWords: input.targetWords,
    phase: "outline",
    outline: [],
    currentSection: 0,
    totalSections: SECTION_COUNT,
    sections: [],
    script: "",
    message: "Planning your script outline…",
  };
}

export async function advanceTopicJob(payload: ScriptTopicJobPayload): Promise<ScriptTopicJobPayload> {
  if (payload.phase === "outline") {
    const outlineRaw = await chatCompletion(
      [
        {
          role: "system",
          content:
            "You are a senior YouTube scriptwriter. Return only valid JSON — no markdown fences.",
        },
        {
          role: "user",
          content: `Create a beat sheet with exactly ${SECTION_COUNT} sections for a YouTube video about "${payload.topic}".
Tone: ${toneLabel(payload)}. Target length label: ${payload.duration}.
Return a JSON array of section titles (strings only).`,
        },
      ],
      800
    );
    const outline = await parseJsonArray(outlineRaw);
    return {
      ...payload,
      phase: "sections",
      outline: outline.slice(0, SECTION_COUNT),
      totalSections: Math.min(outline.length, SECTION_COUNT) || SECTION_COUNT,
      currentSection: 0,
      message: `Outline ready — writing section 1 of ${Math.min(outline.length, SECTION_COUNT) || SECTION_COUNT}…`,
    };
  }

  if (payload.phase === "sections") {
    const index = payload.currentSection;
    const title = payload.outline[index] || `Section ${index + 1}`;
    const wordsPerSection = Math.ceil(payload.targetWords / payload.totalSections);
    const previousTail = payload.script.split("\n").slice(-3).join("\n");

    const sectionText = await chatCompletion(
      [
        {
          role: "system",
          content:
            "You write vivid, spoken-word YouTube narration. Output plain script text only — no headings or markdown.",
        },
        {
          role: "user",
          content: `Write section ${index + 1} of ${payload.totalSections} for a YouTube script.
Topic: ${payload.topic}
Section title: ${title}
Tone: ${toneLabel(payload)}
Target length for this section: about ${wordsPerSection} words.
Beat sheet: ${payload.outline.join(" · ")}
${previousTail ? `Continue naturally after:\n${previousTail}` : "Open the section with a strong hook."}`,
        },
      ],
      1800
    );

    const sections = [...payload.sections, sectionText.trim()];
    const script = sections.join("\n\n");
    const nextIndex = index + 1;
    const wordCount = countWords(script);
    const done = nextIndex >= payload.totalSections || wordCount >= payload.targetWords;

    return {
      ...payload,
      sections,
      script,
      currentSection: nextIndex,
      phase: done ? "done" : "sections",
      message: done
        ? `Script complete — ${wordCount.toLocaleString()} words.`
        : `Writing section ${nextIndex + 1} of ${payload.totalSections}…`,
    };
  }

  return payload;
}
