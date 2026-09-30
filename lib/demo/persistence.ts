import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { ExportJobRecord } from "@/lib/types/export";
import type { JobRecord, Project } from "@/lib/types/project";
import type { Thumbnail } from "@/lib/types/thumbnail";
import type { VisualAsset } from "@/lib/types/visual";
import type { VoiceAsset } from "@/lib/types/voice";
import type { DemoStore } from "@/lib/demo/store";

export const DEMO_DATA_DIR = join(process.cwd(), ".data", "demo");
export const DEMO_STORE_FILE = join(DEMO_DATA_DIR, "store.json");

export type SerializedDemoStore = {
  projects: Project[];
  visualAssets: Record<string, VisualAsset[]>;
  voiceAssets: Record<string, VoiceAsset | null>;
  thumbnails: Record<string, Thumbnail[]>;
  jobs: JobRecord[];
  exportJobs: ExportJobRecord[];
};

function ensureDemoDir() {
  if (!existsSync(DEMO_DATA_DIR)) {
    mkdirSync(DEMO_DATA_DIR, { recursive: true });
  }
}

export function serializeDemoStore(state: DemoStore): SerializedDemoStore {
  return {
    projects: Array.from(state.projects.values()),
    visualAssets: Object.fromEntries(state.visualAssets.entries()),
    voiceAssets: Object.fromEntries(state.voiceAssets.entries()),
    thumbnails: Object.fromEntries(state.thumbnails.entries()),
    jobs: Array.from(state.jobs.values()),
    exportJobs: Array.from(state.exportJobs.values()),
  };
}

export function hydrateDemoStore(state: DemoStore, data: SerializedDemoStore) {
  state.projects.clear();
  for (const project of data.projects) {
    state.projects.set(project.id, project);
  }

  state.visualAssets.clear();
  for (const [projectId, assets] of Object.entries(data.visualAssets ?? {})) {
    state.visualAssets.set(projectId, assets);
  }

  state.voiceAssets.clear();
  for (const [projectId, asset] of Object.entries(data.voiceAssets ?? {})) {
    state.voiceAssets.set(projectId, asset);
  }

  state.thumbnails.clear();
  for (const [projectId, rows] of Object.entries(data.thumbnails ?? {})) {
    state.thumbnails.set(projectId, rows);
  }

  state.jobs.clear();
  for (const job of data.jobs ?? []) {
    state.jobs.set(job.id, job);
  }

  state.exportJobs.clear();
  for (const job of data.exportJobs ?? []) {
    state.exportJobs.set(job.id, job);
  }
}

export function loadPersistedDemoStore(): SerializedDemoStore | null {
  try {
    if (!existsSync(DEMO_STORE_FILE)) return null;
    const raw = readFileSync(DEMO_STORE_FILE, "utf8");
    return JSON.parse(raw) as SerializedDemoStore;
  } catch {
    return null;
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

export function schedulePersistDemoStore(state: DemoStore) {
  if (typeof window !== "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      ensureDemoDir();
      const payload = serializeDemoStore(state);
      writeFileSync(DEMO_STORE_FILE, JSON.stringify(payload, null, 2), "utf8");
    } catch {
      // Best-effort persistence for local demo sessions.
    }
  }, 400);
}

export function demoMediaFilePath(bucket: string, path: string) {
  return join(DEMO_DATA_DIR, "media", bucket, ...path.split("/"));
}

export function ensureDemoMediaDir(bucket: string, path: string) {
  ensureDemoDir();
  const filePath = demoMediaFilePath(bucket, path);
  mkdirSync(dirname(filePath), { recursive: true });
  return filePath;
}
