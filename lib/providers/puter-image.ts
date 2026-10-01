import { downloadMedia, isRasterImage } from "@/lib/providers/media-bytes";
import { isProviderOpen, parkProvider } from "@/lib/providers/circuit";

/**
 * Puter.js image generation (Node / server only).
 * Set PUTER_AUTH_TOKEN from https://puter.com
 * Defaults to Cloudflare provider + FLUX Schnell through Puter.
 */

type PuterImageResult = { src?: string };

type PuterClient = {
  ai: {
    txt2img: (
      prompt: string,
      options?: Record<string, unknown>
    ) => Promise<PuterImageResult>;
  };
};

let puterClient: PuterClient | null = null;
let puterInitFailed = false;

function authToken() {
  return (
    process.env.PUTER_AUTH_TOKEN?.trim() ||
    process.env.PUTER_API_TOKEN?.trim() ||
    process.env.puterAuthToken?.trim() ||
    ""
  );
}

export function isPuterConfigured() {
  return Boolean(authToken()) && !puterInitFailed && isProviderOpen("puter");
}

function loadPuterInit(): ((token: string) => PuterClient) | null {
  try {
    // Runtime-only require so webpack does not try to bundle Puter's CJS entry.
    const runtimeRequire = new Function(
      "return typeof require !== 'undefined' ? require : null"
    )() as NodeRequire | null;
    if (!runtimeRequire) return null;
    const mod = runtimeRequire("@heyputer/puter.js/src/init.cjs") as {
      init?: (token: string) => PuterClient;
      default?: { init?: (token: string) => PuterClient };
    };
    return mod.init || mod.default?.init || null;
  } catch {
    return null;
  }
}

function getPuter(): PuterClient | null {
  if (!authToken() || puterInitFailed || !isProviderOpen("puter")) return null;
  if (puterClient) return puterClient;
  const init = loadPuterInit();
  if (!init) {
    puterInitFailed = true;
    return null;
  }
  try {
    puterClient = init(authToken());
    return puterClient;
  } catch {
    puterInitFailed = true;
    return null;
  }
}

async function bytesFromSrc(src: string): Promise<Buffer | null> {
  if (!src) return null;
  if (src.startsWith("data:image/")) {
    const comma = src.indexOf(",");
    if (comma < 0) return null;
    const bytes = Buffer.from(src.slice(comma + 1), "base64");
    return isRasterImage(bytes, "image/png") ? bytes : null;
  }
  if (/^https?:\/\//i.test(src)) {
    const downloaded = await downloadMedia(src, 20_000);
    if (downloaded && isRasterImage(downloaded.bytes, downloaded.contentType)) {
      return downloaded.bytes;
    }
  }
  return null;
}

export async function fetchPuterImage(
  prompt: string,
  timeoutMs = 25_000,
  seed = Date.now()
): Promise<Buffer | null> {
  const puter = getPuter();
  if (!puter) return null;
  const clipped = prompt.trim().slice(0, 800);
  if (!clipped) return null;

  const provider = process.env.PUTER_IMAGE_PROVIDER?.trim() || "cloudflare";
  const model =
    process.env.PUTER_IMAGE_MODEL?.trim() || "black-forest-labs/flux-schnell";

  try {
    const work = puter.ai.txt2img(clipped, {
      provider,
      model,
      seed: Math.abs(seed) % 2_147_483_647,
      width: 640,
      height: 384,
      aspect_ratio: "16:9",
    });

    const image = (await Promise.race([
      work,
      new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error("Puter image timed out.")), timeoutMs);
      }),
    ])) as PuterImageResult | null;

    const src =
      image && typeof image === "object" && "src" in image
        ? String(image.src || "")
        : "";
    return bytesFromSrc(src);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/auth|unauthorized|forbidden|401|403/i.test(message)) {
      parkProvider("puter", 30 * 60_000);
    }
    return null;
  }
}
