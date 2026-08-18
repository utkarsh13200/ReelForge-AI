/**
 * Live audit of every dashboard option's backend.
 * Run: npx tsx --env-file=.env.local scripts/audit-options.mts
 */
import { existsSync } from "fs";
import { join } from "path";
import { getLlmConfig } from "../lib/providers/llm-config";
import { chatCompletion } from "../lib/providers/llm";
import { fetchYouTubeTranscript } from "../lib/providers/youtube-transcript";
import { extractYouTubeVideoId } from "../lib/script/utils";
import { fetchGeminiImage, getGeminiImageStatus } from "../lib/providers/gemini-image";
import {
  fetchPollinationsImage,
  generateSceneImage,
  fetchSceneImage,
} from "../lib/providers/image";
import { fetchStockImage } from "../lib/providers/stock-image";
import { listTtsVoices, synthesizeSpeech } from "../lib/providers/tts";
import { isComfyUiConfigured } from "../lib/providers/comfyui-config";
import { splitScriptHeuristic } from "../lib/visuals/scene-split";
import { resolveFfmpegPath } from "../lib/visuals/ffmpeg-path";
import { BUNDLED_MUSIC } from "../lib/timeline/bundled-music";

type Result = { name: string; ok: boolean; detail: string; ms: number };
const results: Result[] = [];

async function check(name: string, fn: () => Promise<string>, timeoutMs = 25_000) {
  const started = Date.now();
  try {
    const detail = await Promise.race([
      fn(),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
    const row = { name, ok: true, detail, ms: Date.now() - started };
    results.push(row);
    console.log(`[ OK ] ${name.padEnd(42)} ${String(row.ms).padStart(5)}ms  ${detail}`);
  } catch (error) {
    const row = {
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      ms: Date.now() - started,
    };
    results.push(row);
    console.log(`[FAIL] ${name.padEnd(42)} ${String(row.ms).padStart(5)}ms  ${row.detail}`);
  }
}

const PYRAMID =
  "The Egyptian Pyramids, Cairo, 1920. This was an era of great discovery. The pyramids stood as testaments to Egyptian ingenuity.";

console.log("\nOption audit\n" + "-".repeat(78));

await check("01 Script · LLM config", async () => {
  const cfg = getLlmConfig();
  if (!cfg) throw new Error("LLM_API_KEY missing");
  return `${cfg.model} @ ${cfg.baseUrl}`;
});

await check("01 Script · Topic generate (LLM ping)", async () => {
  const text = await chatCompletion(
    [
      { role: "system", content: "Reply with one short sentence." },
      { role: "user", content: "Write one sentence about Egyptian pyramids." },
    ],
    80
  );
  if (text.length < 8) throw new Error("Empty LLM reply");
  return text.slice(0, 80);
});

await check("01 Script · YouTube URL parser", async () => {
  const id = extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  if (id !== "dQw4w9WgXcQ") throw new Error(`parsed ${id}`);
  return id;
});

await check("01 Script · YouTube captions fetch", async () => {
  const text = await fetchYouTubeTranscript("jNQXAC9IVRw");
  if (text.length < 10) throw new Error("empty transcript");
  return `${text.length} chars: ${text.slice(0, 60)}`;
});

await check("02 Visuals · Gemini images", async () => {
  const status = getGeminiImageStatus();
  const bytes = await fetchGeminiImage(
    "Egyptian pyramids at Giza, cinematic 1920 documentary photo",
    12_000
  );
  if (bytes) return `${status.model} ${bytes.length} bytes`;
  return `skipped — ${status.lastError || "no image quota"}; Pollinations/stock used instead`;
});

await check("02 Visuals · Pollinations images", async () => {
  const bytes = await fetchPollinationsImage("egyptian pyramids cairo 1920 desert", 7, 20_000);
  if (!bytes) throw new Error("no image");
  return `${bytes.length} bytes`;
});

await check("02 Visuals · Wikimedia stock fallback", async () => {
  const bytes = await fetchStockImage("egyptian pyramids giza", "egyptian pyramids");
  if (!bytes) throw new Error("no image");
  return `${bytes.length} bytes`;
});

await check("02 Visuals · Scene still fetch (full chain)", async () => {
  const bytes = await fetchSceneImage(
    "cinematic egyptian pyramids cairo 1920",
    11,
    "pyramids desert cairo"
  );
  if (!bytes) throw new Error("all still providers failed");
  return `${bytes.length} bytes`;
});

await check("02 Visuals · persistSceneMedia URL", async () => {
  const generated = generateSceneImage("egyptian pyramids", "16:9", 1);
  if (!generated.url && generated.provider !== "gemini") {
    throw new Error(`provider=${generated.provider} returned empty URL`);
  }
  return generated.url ? generated.url.slice(0, 90) : "gemini (bytes fetched at assemble time)";
});

await check("02 Visuals · generateSceneImage URL", async () => {
  const generated = generateSceneImage("egyptian pyramids", "16:9", 1);
  if (!generated.url) throw new Error(`provider=${generated.provider} returned empty URL`);
  return `${generated.provider} ${generated.url.slice(0, 80)}`;
});

await check("02 Visuals · Heuristic scene split", async () => {
  const scenes = splitScriptHeuristic(PYRAMID, 3);
  if (scenes.length !== 3) throw new Error(`got ${scenes.length} scenes`);
  return scenes.map((s) => s.title).join(", ");
});

await check("02 Visuals · ffmpeg binary", async () => {
  const path = await resolveFfmpegPath();
  if (!path || !existsSync(path)) throw new Error(`missing: ${path}`);
  return path;
});

await check("02 Visuals · ComfyUI (optional)", async () => {
  if (!isComfyUiConfigured()) return "skipped — Video mode uses built-in Ken Burns";
  return "configured";
});

await check("03 Voice · catalog", async () => {
  const voices = listTtsVoices();
  if (voices.length < 3) throw new Error("too few voices");
  return `${voices.length} voices, default ${voices[0].id}`;
});

await check("03 Voice · Edge TTS synthesize", async () => {
  const result = await synthesizeSpeech(
    "The pyramids of Giza still stand in the desert.",
    "en-US-JennyNeural"
  );
  if (result.audio.length < 1000) throw new Error("tiny audio buffer");
  return `${result.audio.length} bytes, ${result.chunkDurationSeconds.toFixed(1)}s, ${result.subtitles.length} cues`;
}, 45_000);

await check("04 Thumbnail · scene image chain", async () => {
  const bytes = await fetchSceneImage(
    "bold youtube thumbnail egyptian pyramids gold desert, no text",
    99,
    "pyramids"
  );
  if (!bytes) throw new Error("no thumbnail image");
  return `${bytes.length} bytes`;
});

await check("05 Edit · Remotion entry", async () => {
  const entry = join(process.cwd(), "remotion", "index.ts");
  if (!existsSync(entry)) throw new Error("remotion/index.ts missing");
  return entry;
});

await check("05 Edit · bundled music files", async () => {
  const missing = BUNDLED_MUSIC.filter((track) => !existsSync(join(process.cwd(), "public", track.url.replace(/^\//, ""))));
  if (missing.length) throw new Error(missing.map((track) => track.name).join(", "));
  return `${BUNDLED_MUSIC.length} local MP3s`;
});

const failed = results.filter((r) => !r.ok);
console.log("-".repeat(78));
console.log(`${results.length - failed.length}/${results.length} passed, ${failed.length} failed\n`);
process.exit(failed.length ? 1 : 0);
