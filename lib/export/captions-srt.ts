import type { WordTimestamp } from "@/lib/types/voice";

function pad(value: number, size = 2) {
  return String(value).padStart(size, "0");
}

export function formatSrtTime(seconds: number) {
  const clamped = Math.max(0, seconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const secs = Math.floor(clamped % 60);
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000);
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(millis, 3)}`;
}

/** Group word timestamps into readable subtitle cues. */
export function wordsToSrt(words: WordTimestamp[]): string {
  const cues: Array<{ start: number; end: number; text: string }> = [];
  let buffer: WordTimestamp[] = [];

  const flush = () => {
    if (!buffer.length) return;
    cues.push({
      start: buffer[0].start,
      end: Math.max(buffer[0].start + 0.4, buffer[buffer.length - 1].end),
      text: buffer.map((item) => item.word).join(" ").replace(/\s+/g, " ").trim(),
    });
    buffer = [];
  };

  for (const word of words) {
    if (!word.word?.trim()) continue;
    buffer.push(word);
    const span = word.end - buffer[0].start;
    if (buffer.length >= 8 || span >= 2.4) flush();
  }
  flush();

  return cues
    .filter((cue) => cue.text)
    .map((cue, index) => `${index + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text}\n`)
    .join("\n");
}
