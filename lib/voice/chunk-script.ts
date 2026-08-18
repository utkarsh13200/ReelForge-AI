const DEFAULT_MAX_CHARS = 2000;

export function chunkScriptForTts(script: string, maxChars = DEFAULT_MAX_CHARS): string[] {
  const normalized = script.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [normalized];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (!piece) continue;

    const candidate = current ? `${current} ${piece}` : piece;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) chunks.push(current);
    if (piece.length <= maxChars) {
      current = piece;
    } else {
      for (let index = 0; index < piece.length; index += maxChars) {
        chunks.push(piece.slice(index, index + maxChars));
      }
      current = "";
    }
  }

  if (current) chunks.push(current);
  return chunks;
}
