/** Last-resort photographs when AI image generation fails. Never return document scans. */

const USER_AGENT = "ReelForgeAI/1.0 (https://reelforge.ai; educational video tool)";

const STOP_WORDS = new Set([
  "this",
  "that",
  "with",
  "from",
  "were",
  "been",
  "they",
  "their",
  "have",
  "into",
  "over",
  "under",
  "across",
  "while",
  "then",
  "than",
  "them",
  "these",
  "those",
  "what",
  "when",
  "where",
  "which",
  "about",
  "after",
  "before",
  "because",
  "would",
  "could",
  "should",
  "still",
  "just",
  "also",
  "only",
  "more",
  "most",
  "some",
  "such",
  "very",
  "onto",
  "cinematic",
  "photorealistic",
  "documentary",
  "depict",
  "exactly",
  "overlay",
  "watermark",
  "caption",
  "photograph",
  "scene",
  "thousands",
]);

const REJECT_TITLE =
  /book|scan|newspaper|document|pdf|cover|manuscript|magazine|diary|census|letter|verses|brochure|poster|map of|text of|page from/i;

function pickSearchQuery(prompt: string, beat?: string | null) {
  const source = (beat?.trim() || prompt).replace(/\s+/g, " ");
  const proper = [...source.matchAll(/\b[A-Z][A-Za-z]{2,}\b/g)].map((match) => match[0]);
  const words = source
    .split(/[\s,.;:!?()]+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word.toLowerCase()));

  const unique: string[] = [];
  for (const word of [...proper, ...words]) {
    if (!unique.some((item) => item.toLowerCase() === word.toLowerCase())) {
      unique.push(word);
    }
  }
  return unique.slice(0, 5).join(" ") || "city night photograph";
}

export async function fetchStockImage(
  prompt: string,
  beat?: string | null,
  timeoutMs = 6_000,
  seed = 0
): Promise<Buffer | null> {
  const query = `${pickSearchQuery(prompt, beat)} filemime:image/jpeg`;
  const apiUrl =
    "https://commons.wikimedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: query,
      gsrnamespace: "6",
      gsrlimit: "12",
      prop: "imageinfo",
      iiprop: "url",
      iiurlwidth: "768",
      format: "json",
    }).toString();

  try {
    const meta = await fetch(apiUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": USER_AGENT },
    });
    if (!meta.ok) return null;

    const json = (await meta.json()) as {
      query?: {
        pages?: Record<
          string,
          { title?: string; imageinfo?: Array<{ thumburl?: string; url?: string; mime?: string }> }
        >;
      };
    };
    const pages = Object.values(json.query?.pages ?? {}).filter(
      (page) => !REJECT_TITLE.test(page.title ?? "")
    );
    if (!pages.length) return null;

    const start = Math.abs(seed) % pages.length;
    const ordered = pages.slice(start).concat(pages.slice(0, start));

    for (const page of ordered) {
      const imageUrl = page.imageinfo?.[0]?.thumburl || page.imageinfo?.[0]?.url;
      if (!imageUrl) continue;
      const img = await fetch(imageUrl, {
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "User-Agent": USER_AGENT },
      });
      if (!img.ok) continue;
      const bytes = Buffer.from(await img.arrayBuffer());
      if (bytes.length > 8000 && bytes[0] === 0xff && bytes[1] === 0xd8) return bytes;
    }
  } catch {
    // fall through
  }
  return null;
}
