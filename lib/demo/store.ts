import type { ExportJobRecord } from "@/lib/types/export";
import type { JobRecord } from "@/lib/types/project";
import type { Project } from "@/lib/types/project";
import type { Thumbnail } from "@/lib/types/thumbnail";
import type { VisualAsset } from "@/lib/types/visual";
import type { VoiceAsset } from "@/lib/types/voice";
import type { PipelineStatus } from "@/lib/project/pipeline-status";
import { countWords } from "@/lib/script/utils";
import { DEMO_PROJECT_ID, DEMO_USER_ID } from "@/lib/demo/constants";
import { createDemoProject, createDemoVisualAssets } from "@/lib/demo/seed";
import {
  flushPersistDemoStore,
  hydrateDemoStore,
  loadPersistedDemoStore,
  schedulePersistDemoStore,
  serializeDemoStore,
} from "@/lib/demo/persistence";
import { loadRemoteDemoStore, shouldUseRemoteDemoStore } from "@/lib/demo/remote-store";

export type DemoStore = {
  projects: Map<string, Project>;
  visualAssets: Map<string, VisualAsset[]>;
  voiceAssets: Map<string, VoiceAsset | null>;
  thumbnails: Map<string, Thumbnail[]>;
  jobs: Map<string, JobRecord>;
  exportJobs: Map<string, ExportJobRecord>;
};

declare global {
  // eslint-disable-next-line no-var
  var __reelforgeDemoStore: DemoStore | undefined;
  // eslint-disable-next-line no-var
  var __reelforgeDemoHydrated: boolean | undefined;
  // eslint-disable-next-line no-var
  var __reelforgeDemoRemoteReady: Promise<void> | undefined;
}

function store(): DemoStore {
  if (!globalThis.__reelforgeDemoStore) {
    globalThis.__reelforgeDemoStore = {
      projects: new Map(),
      visualAssets: new Map(),
      voiceAssets: new Map(),
      thumbnails: new Map(),
      jobs: new Map(),
      exportJobs: new Map(),
    };
  }

  if (!globalThis.__reelforgeDemoHydrated) {
    globalThis.__reelforgeDemoHydrated = true;
    const persisted = loadPersistedDemoStore();
    if (persisted?.projects?.length) {
      hydrateDemoStore(globalThis.__reelforgeDemoStore, persisted);
    } else {
      const project = createDemoProject();
      globalThis.__reelforgeDemoStore.projects.set(project.id, project);
      globalThis.__reelforgeDemoStore.visualAssets.set(project.id, createDemoVisualAssets(project.id));
      globalThis.__reelforgeDemoStore.voiceAssets.set(project.id, null);
      globalThis.__reelforgeDemoStore.thumbnails.set(project.id, []);
      schedulePersistDemoStore(globalThis.__reelforgeDemoStore);
    }
  } else if (!globalThis.__reelforgeDemoStore.exportJobs) {
    globalThis.__reelforgeDemoStore.exportJobs = new Map();
  }

  return globalThis.__reelforgeDemoStore;
}

function persistSoon() {
  schedulePersistDemoStore(store());
}

export function getDemoStoreSnapshot(): DemoStore {
  return store();
}

/** Pull durable demo state from Blob/Upstash before handling an API request. */
export async function ensureDemoStoreReady() {
  store();
  if (!shouldUseRemoteDemoStore()) return;
  try {
    const remote = await loadRemoteDemoStore();
    if (remote?.projects?.length) {
      hydrateDemoStore(store(), remote);
    }
  } catch {
    // Keep local/in-memory seed if remote is unavailable.
  }
}

export function mutateDemoStore(mutator: (state: DemoStore) => void) {
  mutator(store());
  persistSoon();
}

/** Mutate then await durable remote flush (use in API handlers on Vercel). */
export async function mutateDemoStoreAsync(mutator: (state: DemoStore) => void) {
  mutator(store());
  flushPersistDemoStore(store());
  const { awaitRemoteDemoPersist } = await import("@/lib/demo/persistence");
  await awaitRemoteDemoPersist();
}

export function exportDemoStoreJson() {
  return serializeDemoStore(store());
}

export function getDemoExportJobs(projectId: string) {
  return Array.from(store().exportJobs.values())
    .filter((job) => job.project_id === projectId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function touch(project: Project) {
  project.updated_at = new Date().toISOString();
}

export function listDemoProjects() {
  return Array.from(store().projects.values()).sort(
    (a, b) => b.updated_at.localeCompare(a.updated_at)
  );
}

export function getDemoProject(projectId: string) {
  return store().projects.get(projectId) ?? null;
}

export function createDemoProjectRecord(title?: string, source_type: Project["source_type"] = "topic") {
  const id = `demo-${Date.now()}`;
  const project: Project = {
    id,
    user_id: DEMO_USER_ID,
    title: title?.trim() || "Untitled demo project",
    script: null,
    script_word_count: null,
    source_type,
    source_url: null,
    timeline_json: null,
    visual_video_url: null,
    visual_video_duration_seconds: null,
    status: "draft",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  store().projects.set(id, project);
  store().visualAssets.set(id, []);
  store().voiceAssets.set(id, null);
  store().thumbnails.set(id, []);
  persistSoon();
  return project;
}

export function updateDemoProject(projectId: string, updates: Partial<Pick<Project, "title" | "script">>) {
  const project = getDemoProject(projectId);
  if (!project) return null;
  if (typeof updates.title === "string") project.title = updates.title.trim() || "Untitled demo project";
  if (typeof updates.script === "string") {
    project.script = updates.script;
    project.script_word_count = countWords(updates.script);
  }
  touch(project);
  persistSoon();
  return project;
}

export function getDemoVisualAssets(projectId: string) {
  return store().visualAssets.get(projectId) ?? [];
}

export function getDemoVoiceAsset(projectId: string) {
  return store().voiceAssets.get(projectId) ?? null;
}

export function getDemoThumbnails(projectId: string) {
  return store().thumbnails.get(projectId) ?? [];
}

export function getDemoPipeline(projectId: string): PipelineStatus {
  const project = getDemoProject(projectId);
  if (!project) throw new Error("Project not found.");
  const visuals = getDemoVisualAssets(projectId);
  const voice = getDemoVoiceAsset(projectId);
  const thumbs = getDemoThumbnails(projectId);
  const hasScript = Boolean(project.script?.trim());
  const hasVisuals = visuals.some((row) => row.url) || Boolean(project.visual_video_url);
  const hasVoice = Boolean(voice?.audio_url);
  const hasThumbnail = thumbs.some((row) => row.is_selected && row.url);
  const hasTimeline = Boolean(project.timeline_json) || (hasVisuals && hasVoice);
  const exports = getDemoExportJobs(projectId);
  const hasExport = exports.some((job) => job.status === "completed" && job.output_url);
  return {
    projectId,
    hasScript,
    hasVisuals,
    hasVoice,
    hasThumbnail,
    hasTimeline,
    readyForExport: hasVisuals && hasVoice,
    hasExport,
  };
}

export function saveDemoJob(job: JobRecord) {
  store().jobs.set(job.id, job);
  persistSoon();
  return job;
}

export function getDemoJob(jobId: string) {
  return store().jobs.get(jobId) ?? null;
}

export function ensureDemoSeed() {
  if (!store().projects.has(DEMO_PROJECT_ID)) {
    const project = createDemoProject();
    store().projects.set(project.id, project);
    store().visualAssets.set(project.id, createDemoVisualAssets(project.id));
    store().voiceAssets.set(project.id, null);
    store().thumbnails.set(project.id, []);
    persistSoon();
  }
}
