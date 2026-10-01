import type { Project } from "@/lib/types/project";
import type { VisualAsset } from "@/lib/types/visual";
import type { VoiceAsset } from "@/lib/types/voice";
import type { Thumbnail } from "@/lib/types/thumbnail";

const KEY = "reelforge-demo-session";

export type DemoClientSnapshot = {
  project: Project;
  assets?: VisualAsset[];
  voiceAsset?: VoiceAsset | null;
  thumbnails?: Thumbnail[];
  updatedAt: string;
};

export function saveDemoClientSnapshot(partial: Omit<DemoClientSnapshot, "updatedAt">) {
  if (typeof window === "undefined") return;
  try {
    const prev = loadDemoClientSnapshot(partial.project.id);
    const next: DemoClientSnapshot = {
      project: { ...(prev?.project ?? partial.project), ...partial.project },
      assets: partial.assets ?? prev?.assets,
      voiceAsset: partial.voiceAsset !== undefined ? partial.voiceAsset : prev?.voiceAsset,
      thumbnails: partial.thumbnails ?? prev?.thumbnails,
      updatedAt: new Date().toISOString(),
    };
    sessionStorage.setItem(`${KEY}:${partial.project.id}`, JSON.stringify(next));
  } catch {
    // Quota / private mode — ignore.
  }
}

export function loadDemoClientSnapshot(projectId: string): DemoClientSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${KEY}:${projectId}`);
    if (!raw) return null;
    return JSON.parse(raw) as DemoClientSnapshot;
  } catch {
    return null;
  }
}
