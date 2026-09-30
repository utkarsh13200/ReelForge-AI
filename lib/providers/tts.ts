import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import type { VoiceOption, WordTimestamp } from "@/lib/types/voice";
import { resolveFfmpegPath } from "@/lib/visuals/ffmpeg-path";

const execFileAsync = promisify(execFile);

const VOICES: Array<VoiceOption & { edgeName: string; sapiName: string }> = [
  {
    id: "en-US-JennyNeural",
    label: "Jenny · Warm US narrator",
    locale: "en-US",
    gender: "Female",
    edgeName: "en-US-JennyNeural",
    sapiName: "Microsoft Zira Desktop",
  },
  {
    id: "en-US-GuyNeural",
    label: "Guy · Clear US narrator",
    locale: "en-US",
    gender: "Male",
    edgeName: "en-US-GuyNeural",
    sapiName: "Microsoft David Desktop",
  },
  {
    id: "en-GB-SoniaNeural",
    label: "Sonia · British narrator",
    locale: "en-GB",
    gender: "Female",
    edgeName: "en-GB-SoniaNeural",
    sapiName: "Microsoft Hazel Desktop",
  },
  {
    id: "en-IN-NeerjaNeural",
    label: "Neerja · Indian English narrator",
    locale: "en-IN",
    gender: "Female",
    edgeName: "en-IN-NeerjaNeural",
    sapiName: "Microsoft Zira Desktop",
  },
  {
    id: "en-US-Zira",
    label: "Zira · Warm US narrator",
    locale: "en-US",
    gender: "Female",
    edgeName: "en-US-JennyNeural",
    sapiName: "Microsoft Zira Desktop",
  },
  {
    id: "en-US-David",
    label: "David · Clear US narrator",
    locale: "en-US",
    gender: "Male",
    edgeName: "en-US-GuyNeural",
    sapiName: "Microsoft David Desktop",
  },
];

const EDGE_ALIASES: Record<string, string> = {
  "en-US-AriaNeural": "en-US-JennyNeural",
  "en-US-DavisNeural": "en-US-GuyNeural",
  "en-GB-RyanNeural": "en-US-GuyNeural",
  "en-GB-Hazel": "en-GB-SoniaNeural",
  "hi-IN-SwaraNeural": "en-IN-NeerjaNeural",
  "hi-IN-MadhurNeural": "en-US-GuyNeural",
};

const COMING_SOON_VOICES: VoiceOption[] = [
  {
    id: "hi-IN-coming-soon",
    label: "Hindi narrator",
    locale: "hi-IN",
    gender: "Female",
    comingSoon: true,
  },
  {
    id: "bn-IN-coming-soon",
    label: "Bengali narrator",
    locale: "bn-IN",
    gender: "Female",
    comingSoon: true,
  },
  {
    id: "mr-IN-coming-soon",
    label: "Marathi narrator",
    locale: "mr-IN",
    gender: "Female",
    comingSoon: true,
  },
];

function resolveVoice(voiceId: string) {
  if (COMING_SOON_VOICES.some((voice) => voice.id === voiceId)) {
    throw new Error("This language is coming soon. Pick an English narrator for now.");
  }
  const mapped = EDGE_ALIASES[voiceId] || voiceId;
  return VOICES.find((voice) => voice.id === mapped) ?? VOICES[0];
}

export function isComingSoonVoice(voiceId: string) {
  return COMING_SOON_VOICES.some((voice) => voice.id === voiceId);
}

export function listTtsVoices(): VoiceOption[] {
  const active = VOICES.filter((voice) => voice.id.includes("Neural")).map(({ id, label, locale, gender }) => ({
    id,
    label,
    locale,
    gender,
  }));
  return [...active, ...COMING_SOON_VOICES];
}

function ticksToSeconds(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 1000 ? value / 10_000_000 : value;
}

function estimateWordTimestamps(text: string, durationSeconds: number, offsetSeconds: number): WordTimestamp[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const each = durationSeconds / words.length;
  return words.map((word, index) => ({
    word,
    start: offsetSeconds + index * each,
    end: offsetSeconds + (index + 1) * each,
  }));
}

async function synthesizeWithEdge(
  text: string,
  edgeName: string,
  timeOffsetSeconds: number
): Promise<{ audio: Buffer; subtitles: WordTimestamp[]; chunkDurationSeconds: number }> {
  const { Communicate } = await import("@travisvn/edge-tts");
  const communicate = new Communicate(text, { voice: edgeName, connectionTimeout: 20_000 });
  const parts: Buffer[] = [];
  const subtitles: WordTimestamp[] = [];

  for await (const chunk of communicate.stream()) {
    if (chunk.type === "audio" && chunk.data) {
      parts.push(Buffer.isBuffer(chunk.data) ? chunk.data : Buffer.from(chunk.data));
    }
    if (chunk.type === "WordBoundary" && chunk.text) {
      const start = timeOffsetSeconds + ticksToSeconds(chunk.offset ?? 0);
      const end = start + ticksToSeconds(chunk.duration ?? 0);
      subtitles.push({ word: chunk.text.trim(), start, end: Math.max(end, start + 0.08) });
    }
  }

  const audio = Buffer.concat(parts.map((part) => new Uint8Array(part)));
  if (audio.length < 500) {
    throw new Error("Edge TTS returned empty audio.");
  }

  const chunkDurationSeconds = subtitles.length
    ? Math.max(1, subtitles[subtitles.length - 1].end - timeOffsetSeconds)
    : Math.max(1, audio.length / 6000);

  return {
    audio,
    subtitles: subtitles.length ? subtitles : estimateWordTimestamps(text, chunkDurationSeconds, timeOffsetSeconds),
    chunkDurationSeconds,
  };
}

async function synthesizeWithSapi(
  text: string,
  sapiName: string
): Promise<{ audio: Buffer; durationSeconds: number }> {
  const ffmpegPath = await resolveFfmpegPath();
  const tempDir = await mkdtemp(join(tmpdir(), "reelforge-tts-"));
  const textPath = join(tempDir, "script.txt");
  const wavPath = join(tempDir, "speech.wav");
  const mp3Path = join(tempDir, "speech.mp3");

  try {
    await writeFile(textPath, text, "utf8");
    const scriptPath = join(tempDir, "speak.ps1");
    const ps = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$wanted = ${JSON.stringify(sapiName)}
$installed = @($synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name })
if ($installed -contains $wanted) {
  $synth.SelectVoice($wanted)
} elseif ($installed.Count -gt 0) {
  $english = $installed | Where-Object { $_ -match 'Zira|David|Hazel|Mark|Jenny' } | Select-Object -First 1
  if ($english) { $synth.SelectVoice($english) } else { $synth.SelectVoice($installed[0]) }
}
$synth.SetOutputToWaveFile(${JSON.stringify(wavPath)})
$synth.Speak([IO.File]::ReadAllText(${JSON.stringify(textPath)}, [Text.Encoding]::UTF8))
$synth.Dispose()
`;
    await writeFile(scriptPath, ps, "utf8");

    await execFileAsync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      {
        timeout: 45_000,
        windowsHide: true,
        maxBuffer: 20 * 1024 * 1024,
      }
    );

    const wav = await readFile(wavPath);
    if (wav.length < 1000) throw new Error("Windows SAPI produced an empty voice file.");
    const durationSeconds = wavDurationSeconds(wav);

    await execFileAsync(
      ffmpegPath,
      ["-y", "-i", wavPath, "-c:a", "libmp3lame", "-q:a", "4", mp3Path],
      { timeout: 30_000 }
    );

    return { audio: await readFile(mp3Path), durationSeconds };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function wavDurationSeconds(wav: Buffer): number {
  if (wav.length < 44) return 1;
  const byteRate = wav.readUInt32LE(28) || 44100;
  return Math.max(1, (wav.length - 44) / byteRate);
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Edge TTS timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function ttsProvider() {
  return (process.env.TTS_PROVIDER || "sapi").trim().toLowerCase();
}

export async function synthesizeSpeech(
  text: string,
  voiceId: string,
  timeOffsetSeconds = 0
): Promise<{ audio: Buffer; subtitles: WordTimestamp[]; chunkDurationSeconds: number }> {
  const voice = resolveVoice(voiceId);
  const clipped = text.trim();
  if (!clipped) throw new Error("Nothing to narrate — the script chunk is empty.");

  const fromSapi = async () => {
    const { audio, durationSeconds } = await synthesizeWithSapi(clipped, voice.sapiName);
    if (audio.length < 500) throw new Error("Windows SAPI returned empty audio.");
    return {
      audio,
      subtitles: estimateWordTimestamps(clipped, durationSeconds, timeOffsetSeconds),
      chunkDurationSeconds: durationSeconds,
    };
  };
  const fromEdge = () => {
    // Fail over quickly — hung Edge streams were freezing Module 03 at mid-progress.
    const timeoutMs = Math.min(15_000, Math.max(8_000, 6_000 + clipped.length * 20));
    return withTimeout(synthesizeWithEdge(clipped, voice.edgeName, timeOffsetSeconds), timeoutMs);
  };

  const provider = ttsProvider();
  // On Windows, SAPI is the reliable default. Edge is optional / fallback.
  const preferSapi =
    process.platform === "win32" && (provider === "sapi" || provider === "auto" || !provider);
  const errors: string[] = [];

  if (preferSapi) {
    try {
      return await fromSapi();
    } catch (caught) {
      errors.push(`SAPI: ${caught instanceof Error ? caught.message : String(caught)}`);
    }
    try {
      return await fromEdge();
    } catch (caught) {
      errors.push(`Edge TTS: ${caught instanceof Error ? caught.message : String(caught)}`);
    }
    throw new Error(errors.join(" ") || "Voice generation failed.");
  }

  // TTS_PROVIDER=edge-tts: try Edge first, then Windows SAPI.
  try {
    return await fromEdge();
  } catch (caught) {
    errors.push(`Edge TTS: ${caught instanceof Error ? caught.message : String(caught)}`);
  }
  if (process.platform === "win32") {
    try {
      return await fromSapi();
    } catch (caught) {
      errors.push(`SAPI: ${caught instanceof Error ? caught.message : String(caught)}`);
    }
  }
  throw new Error(errors.join(" ") || "Voice generation failed.");
}
