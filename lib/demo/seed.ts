import type { Project } from "@/lib/types/project";
import type { VisualAsset } from "@/lib/types/visual";
import { countWords } from "@/lib/script/utils";
import { DEMO_PROJECT_ID, DEMO_USER_ID } from "@/lib/demo/constants";

export const DEMO_SCRIPT = `The Great Pyramid of Giza has stood for over four thousand years.
Built during Egypt's Fourth Dynasty, it was the tallest man-made structure on Earth for millennia.
Limestone blocks weighing several tons were cut, transported, and stacked with astonishing precision.
Engineers still debate how ancient workers moved massive stones up the rising courses.
The interior passages align with celestial bodies in ways that suggest advanced astronomical knowledge.
Today, millions visit the Giza plateau to witness this monument to human ambition.
The pyramids remind us that great stories deserve visuals as enduring as the structures themselves.`;

const SCENE_BEATS = [
  "The Great Pyramid of Giza has stood for over four thousand years.",
  "Built during Egypt's Fourth Dynasty, it was the tallest man-made structure on Earth for millennia.",
  "Limestone blocks weighing several tons were cut, transported, and stacked with astonishing precision.",
  "Engineers still debate how ancient workers moved massive stones up the rising courses.",
  "The interior passages align with celestial bodies in ways that suggest advanced astronomical knowledge.",
  "Today, millions visit the Giza plateau to witness this monument to human ambition.",
  "The pyramids remind us that great stories deserve visuals as enduring as the structures themselves.",
];

function sceneImageUrl(prompt: string, seed: number) {
  const encoded = encodeURIComponent(
    `Cinematic documentary still, 16:9, no text: ${prompt.slice(0, 120)}`
  );
  return `https://image.pollinations.ai/prompt/${encoded}?width=960&height=540&seed=${seed}&nologo=true`;
}

const now = new Date().toISOString();

export function createDemoProject(): Project {
  return {
    id: DEMO_PROJECT_ID,
    user_id: DEMO_USER_ID,
    title: "Demo: Secrets of the pyramids",
    script: DEMO_SCRIPT,
    script_word_count: countWords(DEMO_SCRIPT),
    source_type: "topic",
    source_url: null,
    timeline_json: null,
    visual_video_url: null,
    visual_video_duration_seconds: 42,
    status: "in_progress",
    created_at: now,
    updated_at: now,
  };
}

export function createDemoVisualAssets(projectId: string): VisualAsset[] {
  return SCENE_BEATS.map((beat, index) => ({
    id: `demo-asset-${index}`,
    project_id: projectId,
    type: "image" as const,
    prompt: `Documentary scene: ${beat.slice(0, 200)}`,
    url: sceneImageUrl(beat, index + 41),
    scene_index: index,
    scene_title: `Scene ${index + 1}`,
    scene_beat: beat,
    mode: "motion" as const,
    created_at: now,
  }));
}
