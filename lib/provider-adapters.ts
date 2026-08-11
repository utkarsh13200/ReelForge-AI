/**
 * Provider boundaries keep vendor SDKs out of project orchestration. Wire the
 * matching implementation with environment variables in a production deploy.
 */
export interface ScriptProvider {
  generate(input: { topic: string; tone: string; duration: string }): Promise<string>;
}

export interface ImageProvider {
  generate(input: { prompt: string; ratio: "16:9" | "9:16" }): Promise<{ url: string; provider: string }>;
}

export interface VideoProvider {
  generate(input: { prompt: string; durationSeconds: number }): Promise<{ url: string; provider: string }>;
}

export interface TTSProvider {
  synthesize(input: { text: string; language: string; voiceId: string }): Promise<{ url: string; durationSeconds: number }>;
}

export const providerConfig = {
  script: process.env.SCRIPT_PROVIDER ?? "openai",
  image: process.env.IMAGE_PROVIDER ?? "openai-images",
  video: process.env.VIDEO_PROVIDER ?? "replicate",
  tts: process.env.TTS_PROVIDER ?? "elevenlabs",
};
