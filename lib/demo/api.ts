import { NextResponse } from "next/server";
import type { Project } from "@/lib/types/project";
import type { VisualAsset } from "@/lib/types/visual";
import { buildDefaultTimeline } from "@/lib/timeline/build-timeline";
import {
  createDemoProjectRecord,
  getDemoExportJobs,
  getDemoPipeline,
  getDemoProject,
  getDemoThumbnails,
  getDemoVisualAssets,
  getDemoVoiceAsset,
  listDemoProjects,
  updateDemoProject,
} from "@/lib/demo/store";

export function demoJson<T>(body: T, status = 200) {
  return NextResponse.json(body, { status });
}

export function demoListProjects() {
  return demoJson({ projects: listDemoProjects() });
}

export function demoCreateProject(body: { title?: string; source_type?: Project["source_type"] }) {
  const project = createDemoProjectRecord(body.title, body.source_type ?? "topic");
  return demoJson({ project });
}

export function demoGetProject(projectId: string) {
  const project = getDemoProject(projectId);
  if (!project) return demoJson({ error: "Project not found." }, 404);
  return demoJson({ project });
}

export function demoPatchProject(projectId: string, body: { title?: string; script?: string }) {
  const project = updateDemoProject(projectId, body);
  if (!project) return demoJson({ error: "Project not found." }, 404);
  return demoJson({ project });
}

export function demoGetVisuals(projectId: string) {
  const project = getDemoProject(projectId);
  if (!project) return demoJson({ error: "Project not found." }, 404);
  return demoJson({ project, assets: getDemoVisualAssets(projectId) });
}

export function demoGetVoice(projectId: string) {
  const project = getDemoProject(projectId);
  if (!project) return demoJson({ error: "Project not found." }, 404);
  return demoJson({ project, voiceAsset: getDemoVoiceAsset(projectId) });
}

export function demoGetThumbnails(projectId: string) {
  const project = getDemoProject(projectId);
  if (!project) return demoJson({ error: "Project not found." }, 404);
  const thumbnails = getDemoThumbnails(projectId);
  const selected = thumbnails.find((row) => row.is_selected) ?? null;
  return demoJson({ project, thumbnails, selectedThumbnail: selected });
}

export function demoGetPipeline(projectId: string) {
  try {
    return demoJson({ pipeline: getDemoPipeline(projectId) });
  } catch (error) {
    return demoJson(
      { error: error instanceof Error ? error.message : "Could not load pipeline status." },
      500
    );
  }
}

export function demoGetEdit(projectId: string) {
  const project = getDemoProject(projectId);
  if (!project) return demoJson({ error: "Project not found." }, 404);
  const assets = getDemoVisualAssets(projectId);
  const voice = getDemoVoiceAsset(projectId);
  const assembledVideoUrl = project.visual_video_url;
  const timeline = buildDefaultTimeline(assets, voice, project.timeline_json, assembledVideoUrl);
  return demoJson({ project, visualAssets: assets, voiceAsset: voice, timeline });
}

export function demoGetTimeline(projectId: string) {
  return demoGetEdit(projectId);
}

export function demoGetExport(projectId: string) {
  const project = getDemoProject(projectId);
  if (!project) return demoJson({ error: "Project not found." }, 404);
  let pipeline = null;
  try {
    pipeline = getDemoPipeline(projectId);
  } catch {
    pipeline = null;
  }
  return demoJson({
    project,
    exportJobs: getDemoExportJobs(projectId),
    latestExport: getDemoExportJobs(projectId)[0] ?? null,
    pipeline,
  });
}

export function demoSaveTimeline(projectId: string, timeline: unknown) {
  const project = getDemoProject(projectId);
  if (!project) return demoJson({ error: "Project not found." }, 404);
  project.timeline_json = timeline;
  project.status = "in_progress";
  project.updated_at = new Date().toISOString();
  return demoJson({ project, timeline });
}

export function demoPatchVisualAsset(
  projectId: string,
  assetId: string,
  updates: { prompt?: string; mode?: VisualAsset["mode"] }
) {
  const assets = getDemoVisualAssets(projectId);
  const asset = assets.find((item) => item.id === assetId);
  if (!asset) return demoJson({ error: "Scene not found." }, 404);
  if (typeof updates.prompt === "string") asset.prompt = updates.prompt.trim();
  if (updates.mode) asset.mode = updates.mode;
  return demoJson({ asset });
}
