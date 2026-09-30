"use client";

import { ModuleLink } from "@/components/dashboard/module-nav";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Film, ImageIcon, Loader2, RefreshCw, Sparkles, Video, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { Project } from "@/lib/types/project";
import type { JobPollResponse, VisualAsset, VisualMode } from "@/lib/types/visual";
import { ModuleHeader } from "@/components/dashboard/module-header";
import { WorkspaceNotice } from "@/components/dashboard/workspace-notice";
import { JobProgressCard } from "@/components/dashboard/job-progress-card";
import { useWorkspaceProject } from "@/hooks/use-workspace-project";
import { useProject } from "@/components/dashboard/project-provider";
import { apiFetch } from "@/lib/api/client";
import { countWords } from "@/lib/script/utils";
import { motionRenderNote, VISUAL_MODE_LABELS, formatVideoDuration, describeScenePlan, estimateVisualPipelineSeconds, formatCountdown } from "@/lib/video-gen";

function SceneStill({ url, title }: { url: string; title: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <ImageIcon className="h-6 w-6 opacity-50" />
        Image failed to load
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={title}
      className="h-full w-full object-cover"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function isVideoAsset(asset: VisualAsset) {
  return (
    asset.mode === "video" ||
    asset.type === "video" ||
    Boolean(asset.url?.includes(".mp4"))
  );
}

export function VisualsWorkspace({ initialProject }: { initialProject: Project | null }) {
  const { project, setProject, activeProjectId } = useWorkspaceProject(initialProject);
  const { scriptForVisuals, setScriptForVisuals } = useProject();
  const [script, setScript] = useState(initialProject?.script ?? scriptForVisuals ?? "");
  const [assets, setAssets] = useState<VisualAsset[]>([]);
  const [visualMode, setVisualMode] = useState<VisualMode>("image");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [job, setJob] = useState<JobPollResponse | null>(null);
  const [visualVideoUrl, setVisualVideoUrl] = useState<string | null>(
    initialProject?.visual_video_url ?? null
  );
  const [visualVideoDuration, setVisualVideoDuration] = useState<number | null>(
    initialProject?.visual_video_duration_seconds ?? null
  );

  useEffect(() => {
    if (scriptForVisuals?.trim()) {
      setScript(scriptForVisuals);
      setScriptForVisuals(null);
      return;
    }
    if (project?.script?.trim()) {
      setScript(project.script);
    }
  }, [scriptForVisuals, project?.script, project?.updated_at, activeProjectId, setScriptForVisuals]);

  const wordCount = useMemo(() => countWords(script), [script]);
  const hasScript = Boolean(script.trim());
  const scenePlanLabel = useMemo(
    () => (hasScript ? describeScenePlan(script, visualMode) : ""),
    [hasScript, script, visualMode]
  );
  const estimatedTotalSeconds = useMemo(
    () => (hasScript ? estimateVisualPipelineSeconds(script, visualMode) : 0),
    [hasScript, script, visualMode]
  );
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!busy || estimatedTotalSeconds <= 0) {
      setCountdownSeconds(null);
      return;
    }

    setCountdownSeconds(estimatedTotalSeconds);
    const timer = window.setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev === null || prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [busy, estimatedTotalSeconds]);

  const loadVisuals = useCallback(async (projectId: string) => {
    const data = await apiFetch<{ project: Project; assets: VisualAsset[] }>(
      `/api/projects/${projectId}/visuals`
    );
    setProject(data.project);
    setAssets(data.assets ?? []);
    if (data.project.script?.trim()) {
      setScript(data.project.script);
    }
    setVisualVideoUrl(data.project.visual_video_url ?? null);
    setVisualVideoDuration(
      data.project.visual_video_duration_seconds
        ? Number(data.project.visual_video_duration_seconds)
        : null
    );
    return data.assets ?? [];
  }, [setProject]);

  useEffect(() => {
    if (project?.id) {
      loadVisuals(project.id).catch((error) => {
        setNotice(error instanceof Error ? error.message : "Could not load visuals.");
      });
    } else {
      setAssets([]);
    }
  }, [project?.id, activeProjectId, loadVisuals]);

  const ensureProject = useCallback(async () => {
    if (project?.id) return project;
    const data = await apiFetch<{ project: Project }>("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Visual project",
        source_type: "topic",
        script: script.trim(),
      }),
    });
    setProject(data.project);
    return data.project;
  }, [project, script, setProject]);

  const pollJob = useCallback(async (jobId: string) => {
    const data = await apiFetch<JobPollResponse>(`/api/jobs/${jobId}`);
    setJob(data);
    if (data.assets?.length) setAssets(data.assets);
    if (data.visualVideoUrl) setVisualVideoUrl(data.visualVideoUrl);
    if (data.visualVideoDurationSeconds) {
      setVisualVideoDuration(data.visualVideoDurationSeconds);
    }
    return data;
  }, []);

  const waitForJob = useCallback(
    async (jobId: string) => {
      let latest = await pollJob(jobId);
      while (latest.status === "queued" || latest.status === "running") {
        await new Promise((resolve) => setTimeout(resolve, 400));
        latest = await pollJob(jobId);
      }
      return latest;
    },
    [pollJob]
  );

  async function persistScript() {
    const active = await ensureProject();
    const data = await apiFetch<{ project: Project }>(`/api/projects/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script }),
    });
    setProject(data.project);
    return data.project;
  }

  async function runVisualPipeline() {
    if (!hasScript) {
      setNotice("Add a script first — write here or generate in Module 01.");
      return;
    }
    if (visualMode === "video") {
      setNotice("AI Video generation is coming soon. Switch to AI Image or Motion.");
      return;
    }

    setBusy(true);
    setNotice("Generating script-matched AI stills for your opening scenes…");
    setJob(null);
    try {
      const active = await persistScript();
      const data = await apiFetch<{ jobId: string; status?: string }>(
        `/api/projects/${active.id}/visuals/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: visualMode, fromScript: true, script }),
        }
      );
      const latest =
        data.status === "completed"
          ? await pollJob(data.jobId)
          : await waitForJob(data.jobId);
      setBusy(false);
      if (latest.status === "failed") {
        setNotice(latest.error || "Generation failed.");
        await loadVisuals(active.id);
        return;
      }
      await loadVisuals(active.id);
      setNotice(
        latest.visualVideoUrl
          ? `Your silent AI video is ready (${formatVideoDuration(latest.visualVideoDurationSeconds ?? visualVideoDuration)}). Continue to Voice to add narration.`
          : `${VISUAL_MODE_LABELS[visualMode]} scenes created — video assembly did not finish. Try again.`
      );
    } catch (error) {
      setBusy(false);
      setNotice(error instanceof Error ? error.message : "Visual pipeline failed.");
    }
  }

  async function splitScenesOnly() {
    if (!hasScript) {
      setNotice("Add a script first.");
      return;
    }
    if (visualMode === "video") {
      setNotice("AI Video generation is coming soon. Switch to AI Image or Motion.");
      return;
    }
    setBusy(true);
    try {
      const active = await persistScript();
      setNotice("Analyzing script and creating scene prompts…");
      setJob(null);
      const data = await apiFetch<{ jobId: string }>(`/api/projects/${active.id}/visuals/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: visualMode, script }),
      });
      const latest = await waitForJob(data.jobId);
      setBusy(false);
      if (latest.status === "failed") {
        setNotice(latest.error || "Could not split script.");
        return;
      }
      await loadVisuals(active.id);
      setNotice(`Created ${latest.sceneCount ?? assets.length} script-matched scenes.`);
    } catch (error) {
      setBusy(false);
      setNotice(error instanceof Error ? error.message : "Could not split script.");
    }
  }

  async function savePrompt(asset: VisualAsset, prompt: string) {
    if (!project?.id) return;
    const data = await apiFetch<{ asset: VisualAsset }>(`/api/projects/${project.id}/visuals/${asset.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    setAssets((items) => items.map((item) => (item.id === asset.id ? data.asset : item)));
  }

  async function regenerateScene(asset: VisualAsset) {
    if (!project?.id) return;
    if (visualMode === "video") {
      setNotice("AI Video generation is coming soon. Switch to AI Image or Motion.");
      return;
    }
    setBusy(true);
    setNotice(null);
    setJob(null);
    try {
      const data = await apiFetch<{ jobId: string }>(`/api/projects/${project.id}/visuals/${asset.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: asset.prompt, mode: visualMode }),
      });
      const latest = await waitForJob(data.jobId);
      setBusy(false);
      if (latest.status === "failed") {
        setNotice(latest.error || "Regeneration failed.");
        return;
      }
      await loadVisuals(project.id);
      setNotice(`Scene ${asset.scene_index + 1} regenerated.`);
    } catch (error) {
      setBusy(false);
      setNotice(error instanceof Error ? error.message : "Could not regenerate scene.");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <ModuleHeader
        step="Module 02 · Visuals"
        title="Visual production"
        description="Build a complete silent AI video from your script — 5 Image or Motion scenes matched to the narration in a 1-minute preview."
      />

      <Card className={visualVideoUrl ? "border-forge/30" : "border-dashed border-forge/20"}>
        <CardHeader>
          <CardTitle className="text-xl">Silent AI video output</CardTitle>
          <CardDescription>
            {busy
              ? `Generating script-matched scenes and assembling your video…${
                  countdownSeconds != null && countdownSeconds > 0
                    ? ` (~${formatCountdown(countdownSeconds)} remaining)`
                    : ""
                }`
              : visualVideoUrl
                ? `Ready — ${formatVideoDuration(visualVideoDuration)} silent video from your script.`
                : hasScript
                  ? `Click Generate below. Plan for ${visualMode} mode: ${scenePlanLabel}`
                  : "Add a script to generate your video."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
            {visualVideoUrl && !busy ? (
              <video
                src={visualVideoUrl}
                className="h-full w-full object-contain"
                controls
                playsInline
                preload="metadata"
              />
            ) : visualVideoUrl && busy ? (
              <>
                <video
                  src={visualVideoUrl}
                  className="h-full w-full object-contain opacity-30"
                  muted
                  playsInline
                  preload="metadata"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-center">
                  <Loader2 className="h-10 w-10 animate-spin text-forge" />
                    <p className="text-4xl font-semibold tabular-nums text-forge">
                      {countdownSeconds && countdownSeconds > 0
                        ? formatCountdown(countdownSeconds)
                        : "Finishing…"}
                    </p>
                  <p className="text-sm text-muted-foreground">
                    {job?.message ?? "Generating your video…"}
                  </p>
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                {busy ? (
                  <>
                    <Loader2 className="h-10 w-10 animate-spin text-forge" />
                    <p className="text-5xl font-semibold tabular-nums text-forge">
                      {countdownSeconds && countdownSeconds > 0
                        ? formatCountdown(countdownSeconds)
                        : "Finishing…"}
                    </p>
                    <p className="text-sm text-muted-foreground">{job?.message ?? "Generating your video…"}</p>
                  </>
                ) : (
                  <>
                    <Video className="h-10 w-10 text-forge/50" />
                    <p className="max-w-md text-sm text-muted-foreground">
                      Your complete silent video will appear here after generation.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
          {visualVideoUrl && !busy ? (
            <Button asChild variant="outline" size="sm" className="mt-4">
              <ModuleLink href="/dashboard/voice">Add voice in Module 03 →</ModuleLink>
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="text-xl">Project script</CardTitle>
              <CardDescription>{wordCount.toLocaleString()} words</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => persistScript()} disabled={!script.trim() || busy}>
              Save script
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={script}
              onChange={(event) => setScript(event.target.value)}
              placeholder="Paste or write your narration script here, or generate one in Module 01."
              className="min-h-[280px]"
              disabled={busy}
            />
            {!hasScript ? (
              <Button asChild variant="link" className="h-auto p-0 text-forge">
                <ModuleLink href="/dashboard/script">Go to Script module →</ModuleLink>
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Generate visuals</CardTitle>
            <CardDescription>
              {motionRenderNote(visualMode)}
              {hasScript ? (
                <span className="mt-1 block text-forge/90">
                  {scenePlanLabel} · ~{formatCountdown(estimatedTotalSeconds)} to generate
                </span>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Output type</Label>
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-secondary/80 p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={visualMode === "image" ? "default" : "ghost"}
                  onClick={() => setVisualMode("image")}
                  disabled={busy}
                  className="gap-1"
                >
                  <ImageIcon className="h-4 w-4" />
                  AI Image
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={visualMode === "motion" ? "default" : "ghost"}
                  onClick={() => setVisualMode("motion")}
                  disabled={busy}
                  className="gap-1"
                >
                  <Film className="h-4 w-4" />
                  Motion
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={visualMode === "video" ? "default" : "ghost"}
                  onClick={() => {
                    setVisualMode("video");
                    setNotice("AI Video generation is coming soon. Use AI Image or Motion for now.");
                  }}
                  disabled={busy}
                  className="relative gap-1"
                >
                  <Video className="h-4 w-4" />
                  Video
                  <span className="pointer-events-none absolute -right-1 -top-2 rounded bg-muted px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Soon
                  </span>
                </Button>
              </div>
            </div>

            <Button onClick={runVisualPipeline} disabled={busy || !hasScript || visualMode === "video"} className="w-full">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate {VISUAL_MODE_LABELS[visualMode].toLowerCase()} from script
            </Button>

            <Button
              onClick={splitScenesOnly}
              disabled={busy || !hasScript || visualMode === "video"}
              variant="outline"
              className="w-full"
            >
              <Wand2 className="h-4 w-4" />
              Split script into scenes only
            </Button>
          </CardContent>
        </Card>
      </div>

      {job && busy ? (
        <JobProgressCard
          message={job.message}
          progress={job.progress}
          secondsRemaining={countdownSeconds}
          estimatedTotalSeconds={estimatedTotalSeconds}
        />
      ) : null}

      {!assets.length ? (
        <Card className="border-dashed border-white/15">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Sparkles className="h-8 w-8 text-forge/60" />
            <p className="text-sm text-muted-foreground">
              Scenes will appear here after you split the script and generate visuals.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => (
            <Card key={asset.id} className="overflow-hidden transition hover:border-forge/20">
              <div className="aspect-video bg-black/40">
                {asset.url ? (
                  isVideoAsset(asset) ? (
                    <video src={asset.url} className="h-full w-full object-cover" controls muted loop playsInline />
                  ) : (
                    <SceneStill
                      url={asset.url}
                      title={asset.scene_title || `Scene ${asset.scene_index + 1}`}
                    />
                  )
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                    <ImageIcon className="h-6 w-6 opacity-50" />
                    No visual yet
                  </div>
                )}
              </div>
              <CardHeader className="space-y-1 pb-2">
                <CardTitle className="text-base">
                  Scene {asset.scene_index + 1}
                  {asset.scene_title ? ` · ${asset.scene_title}` : ""}
                </CardTitle>
                <CardDescription className="text-xs uppercase tracking-wide">
                  {isVideoAsset(asset) && asset.mode !== "video"
                    ? "Video clip"
                    : VISUAL_MODE_LABELS[asset.mode as VisualMode] ?? asset.mode}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  className="min-h-[100px] text-xs"
                  value={asset.prompt ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAssets((items) =>
                      items.map((item) => (item.id === asset.id ? { ...item, prompt: value } : item))
                    );
                  }}
                  onBlur={(event) => savePrompt(asset, event.target.value)}
                />
                <Button size="sm" variant="outline" onClick={() => regenerateScene(asset)} disabled={busy}>
                  <RefreshCw className="h-4 w-4" />
                  Regenerate as {VISUAL_MODE_LABELS[visualMode]}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {notice ? (
        <WorkspaceNotice
          message={notice}
          variant={
            notice.toLowerCase().includes("fail") ||
            notice.toLowerCase().includes("error") ||
            notice.toLowerCase().includes("requires")
              ? "error"
              : notice.toLowerCase().includes("complete") ||
                  notice.toLowerCase().includes("created") ||
                  notice.toLowerCase().includes("ready")
                ? "success"
                : "info"
          }
        />
      ) : null}
    </div>
  );
}
