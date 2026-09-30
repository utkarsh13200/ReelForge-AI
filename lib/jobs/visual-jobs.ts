import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRecord } from "@/lib/types/project";
import type {
  VisualGenerateJobPayload,
  VisualJobPayload,
  VisualRegenerateJobPayload,
  VisualSplitJobPayload,
  JobPollResponse,
} from "@/lib/types/visual";
import type { ImageGenProgressEvent } from "@/lib/providers/fast-image-gen";
import { splitScriptIntoScenes } from "@/lib/visuals/scene-split";
import { persistSceneMedia } from "@/lib/visuals/persist-image";
import { assembleVisualVideo } from "@/lib/visuals/assemble-video";

const visualJobLocks = new Map<string, Promise<JobRecord>>();

export function isVisualJobBusy(jobId: string) {
  return visualJobLocks.has(jobId);
}

export async function processVisualJobStep(
  supabase: SupabaseClient,
  job: JobRecord,
  userId: string
): Promise<JobRecord> {
  const existing = visualJobLocks.get(job.id);
  if (existing) return existing;

  const work = runVisualJobSteps(supabase, job, userId).finally(() => {
    visualJobLocks.delete(job.id);
  });
  visualJobLocks.set(job.id, work);
  return work;
}

async function runVisualJobSteps(
  supabase: SupabaseClient,
  job: JobRecord,
  userId: string
): Promise<JobRecord> {
  const MAX_STEPS = 4;
  let current = job;

  try {
    for (let step = 0; step < MAX_STEPS; step += 1) {
      if (current.status === "completed" || current.status === "failed") break;
      current = await runVisualJobStepOnce(supabase, current, userId);
      if (current.status === "completed" || current.status === "failed") break;
    }
    return current;
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : "Visual job failed.";
    const { data } = await supabase
      .from("job_queue")
      .update({ status: "failed", error, updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .select("*")
      .single();
    return (data as JobRecord) || { ...job, status: "failed", error };
  }
}

async function runVisualJobStepOnce(
  supabase: SupabaseClient,
  job: JobRecord,
  userId: string
): Promise<JobRecord> {
  const payload = job.payload as VisualJobPayload;
  let progress = job.progress;
  let status: JobRecord["status"] = "running";
  let nextPayload = payload;
  let error: string | null = null;

  try {
    if (payload.kind === "visual_split") {
      nextPayload = await runSplitJob(supabase, payload, userId);
      progress = 100;
      status = "completed";
    } else if (payload.kind === "visual_generate") {
      const result = await runGenerateStep(supabase, payload, userId, job.id);
      nextPayload = result.payload;
      progress = result.progress;
      status = result.status;
    } else {
      const result = await runRegenerateStep(supabase, payload, userId);
      nextPayload = result.payload;
      progress = result.progress;
      status = result.status;
    }

    const { data, error: updateError } = await supabase
      .from("job_queue")
      .update({
        payload: nextPayload,
        progress,
        status,
        error,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .select("*")
      .single();

    if (updateError) throw new Error(updateError.message);
    return data as JobRecord;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Visual job failed.";
    const { data } = await supabase
      .from("job_queue")
      .update({ status: "failed", error, updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .select("*")
      .single();
    return (data as JobRecord) || { ...job, status: "failed", error };
  }
}

async function runSplitJob(
  supabase: SupabaseClient,
  payload: VisualSplitJobPayload,
  userId: string
) {
  const { data: project } = await supabase
    .from("projects")
    .select("script")
    .eq("id", payload.projectId)
    .eq("user_id", userId)
    .single();

  const script = payload.script?.trim() || project?.script?.trim() || "";
  if (!script) {
    throw new Error("Project script not found. Complete Module 1 first.");
  }

  const scenes = await splitScriptIntoScenes(script, payload.mode ?? "image");
  await supabase.from("visual_assets").delete().eq("project_id", payload.projectId);

  const rows = scenes.map((scene, index) => ({
    project_id: payload.projectId,
    scene_index: index,
    scene_title: scene.title,
    scene_beat: scene.beat,
    prompt: scene.prompt.slice(0, 500),
    type: "image" as const,
    mode: payload.mode ?? "image",
    url: null,
  }));

  let { error: insertError } = await supabase.from("visual_assets").insert(rows);
  if (insertError?.message?.includes("scene_beat")) {
    const fallbackRows = rows.map((row) => ({
      project_id: row.project_id,
      scene_index: row.scene_index,
      scene_title: row.scene_title,
      prompt: row.prompt,
      type: row.type,
      mode: row.mode,
      url: row.url,
    }));
    ({ error: insertError } = await supabase.from("visual_assets").insert(fallbackRows));
  }
  if (insertError) throw new Error(insertError.message);

  await supabase
    .from("projects")
    .update({ status: "in_progress", updated_at: new Date().toISOString() })
    .eq("id", payload.projectId);

  return {
    ...payload,
    sceneCount: scenes.length,
    message: `Created ${scenes.length} script-matched scene prompts.`,
  } satisfies VisualSplitJobPayload;
}

async function runAssembleStep(
  supabase: SupabaseClient,
  payload: VisualGenerateJobPayload,
  userId: string,
  jobId?: string
) {
  const { data: project } = await supabase
    .from("projects")
    .select("script")
    .eq("id", payload.projectId)
    .eq("user_id", userId)
    .single();

  const script = payload.script?.trim() || project?.script?.trim() || "";
  if (!script) {
    throw new Error("Project script not found for video assembly.");
  }

  const { data: assets, error: assetsError } = await supabase
    .from("visual_assets")
    .select("*")
    .eq("project_id", payload.projectId)
    .order("scene_index", { ascending: true });

  if (assetsError) throw new Error(assetsError.message);

  const onImageProgress = jobId
    ? async (event: ImageGenProgressEvent) => {
        const done = event.index + 1;
        const progress = Math.min(85, 12 + Math.round((done / event.total) * 68));
        const label =
          event.status === "cached"
            ? "loaded from cache"
            : event.status === "done"
              ? `via ${event.provider ?? "AI"}`
              : "retrying…";
        await supabase
          .from("job_queue")
          .update({
            progress,
            payload: {
              ...payload,
              phase: "assemble" as const,
              message: `Scene ${done}/${event.total} ${label}…`,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      }
    : undefined;

  const assembled = await assembleVisualVideo(supabase, userId, payload.projectId, {
    assets: assets ?? [],
    script,
    mode: payload.mode,
    onImageProgress,
  });

  const { error: projectUpdateError } = await supabase
    .from("projects")
    .update({
      visual_video_url: assembled.url,
      visual_video_duration_seconds: assembled.durationSeconds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payload.projectId);

  if (projectUpdateError) throw new Error(projectUpdateError.message);

  return {
    payload: {
      ...payload,
      phase: "assemble" as const,
      message: `Video ready — ${Math.round(assembled.durationSeconds)}s silent preview assembled from your script.`,
    } satisfies VisualGenerateJobPayload,
    progress: 100,
    status: "completed" as const,
  };
}

async function runGenerateStep(
  supabase: SupabaseClient,
  payload: VisualGenerateJobPayload,
  userId: string,
  jobId: string
) {
  if (payload.fromScript) {
    await runSplitJob(
      supabase,
      {
        kind: "visual_split",
        projectId: payload.projectId,
        mode: payload.mode,
        script: payload.script,
        message: "Splitting script into scenes…",
      },
      userId
    );
  }

  return runAssembleStep(supabase, { ...payload, phase: "assemble" }, userId, jobId);
}

async function runRegenerateStep(
  supabase: SupabaseClient,
  payload: VisualRegenerateJobPayload,
  userId: string
) {
  if (payload.phase === "done") {
    return { payload, progress: 100, status: "completed" as const };
  }

  const { data: asset, error: assetError } = await supabase
    .from("visual_assets")
    .select("*")
    .eq("id", payload.assetId)
    .single();

  if (assetError || !asset) throw new Error("Scene asset not found.");

  const generated = await persistSceneMedia(
    supabase,
    userId,
    payload.projectId,
    asset.scene_index,
    payload.prompt,
    payload.mode,
    asset.scene_beat
  );

  const updatePayload = {
    prompt: payload.prompt,
    url: generated.url,
    type: generated.type,
    mode: generated.mode,
  };

  let { error: updateError } = await supabase
    .from("visual_assets")
    .update(updatePayload)
    .eq("id", payload.assetId);

  if (updateError && generated.mode === "video") {
    ({ error: updateError } = await supabase
      .from("visual_assets")
      .update({ ...updatePayload, mode: "motion" })
      .eq("id", payload.assetId));
  }

  if (updateError) throw new Error(updateError.message);

  return {
    payload: {
      ...payload,
      phase: "done",
      message: `Scene ${asset.scene_index + 1} regenerated.`,
    } satisfies VisualRegenerateJobPayload,
    progress: 100,
    status: "completed" as const,
  };
}

export function visualJobResponse(job: JobRecord) {
  const payload = job.payload as VisualJobPayload;
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    message: payload.message,
    error: job.error,
    projectId: payload.projectId,
    sceneCount: payload.kind === "visual_split" ? payload.sceneCount ?? null : null,
  };
}

export async function attachVisualJobExtras(
  supabase: SupabaseClient,
  job: JobRecord,
  response: JobPollResponse
): Promise<JobPollResponse> {
  if (!job.project_id || !job.type.startsWith("visual_")) return response;

  const { data: project } = await supabase
    .from("projects")
    .select("visual_video_url, visual_video_duration_seconds")
    .eq("id", job.project_id)
    .maybeSingle();

  if (project?.visual_video_url) {
    response.visualVideoUrl = project.visual_video_url;
    response.visualVideoDurationSeconds = Number(project.visual_video_duration_seconds) || null;
  }

  return response;
}