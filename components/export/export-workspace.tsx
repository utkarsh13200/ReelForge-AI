"use client";

import { ModuleLink } from "@/components/dashboard/module-nav";
import { useCallback, useEffect, useState } from "react";
import { Download, Film, Loader2, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ModuleHeader } from "@/components/dashboard/module-header";
import { WorkspaceNotice } from "@/components/dashboard/workspace-notice";
import { JobProgressCard } from "@/components/dashboard/job-progress-card";
import { useWorkspaceProject } from "@/hooks/use-workspace-project";
import type { Project } from "@/lib/types/project";
import type { PipelineStatus } from "@/lib/project/pipeline-status";
import type { ExportJobRecord, ExportJobPollResponse } from "@/lib/types/export";
import { ASPECT_RATIO_OPTIONS, type TimelineAspectRatio } from "@/lib/types/timeline";

export function ExportWorkspace({ initialProject }: { initialProject: Project | null }) {
  const { project, setProject, activeProjectId } = useWorkspaceProject(initialProject);
  const [latestExport, setLatestExport] = useState<ExportJobRecord | null>(null);
  const [aspectRatio, setAspectRatio] = useState<TimelineAspectRatio>("16:9");
  const [busy, setBusy] = useState(false);
  const [pipeline, setPipeline] = useState<PipelineStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeVariant, setNoticeVariant] = useState<"info" | "success" | "error">("info");
  const [job, setJob] = useState<ExportJobPollResponse | null>(null);
  const [progress, setProgress] = useState(0);

  const loadExportState = useCallback(async (projectId: string) => {
    const response = await fetch(`/api/projects/${projectId}/export`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load export state.");
    setProject(data.project);
    setLatestExport(data.latestExport ?? null);
    setPipeline(data.pipeline ?? null);
    const savedRatio = data.project?.timeline_json?.aspectRatio;
    if (savedRatio) setAspectRatio(savedRatio);
  }, [setProject]);

  useEffect(() => {
    if (project?.id) {
      loadExportState(project.id).catch((error) => {
        setNoticeVariant("error");
        setNotice(error instanceof Error ? error.message : "Could not load export state.");
      });
    }
  }, [project?.id, activeProjectId, loadExportState]);

  const pollJob = useCallback(async (jobId: string) => {
    const response = await fetch(`/api/jobs/${jobId}`);
    const data = (await response.json()) as ExportJobPollResponse & { error?: string };
    if (!response.ok) throw new Error(data.error || "Job polling failed.");
    setJob(data);
    if (data.exportJob) setLatestExport(data.exportJob);
    if (data.outputUrl) {
      setLatestExport((current) =>
        current ? { ...current, output_url: data.outputUrl ?? current.output_url, status: "completed" } : current
      );
    }
    return data;
  }, []);

  useEffect(() => {
    if (!job?.id || job.status === "completed" || job.status === "failed") return;

    const timer = window.setInterval(async () => {
      try {
        const latest = await pollJob(job.id);
        if (latest.status === "completed") {
          setBusy(false);
          setNoticeVariant("success");
          setNotice(latest.message || "Export complete.");
          if (project?.id) await loadExportState(project.id);
        }
        if (latest.status === "failed") {
          setBusy(false);
          setNoticeVariant("error");
          setNotice(latest.error || "Export failed.");
        }
      } catch (error) {
        setBusy(false);
        setNoticeVariant("error");
        setNotice(error instanceof Error ? error.message : "Job polling failed.");
      }
    }, 2500);

    return () => window.clearInterval(timer);
  }, [job, pollJob, project?.id, loadExportState]);

  async function renderVideo() {
    if (!project?.id) return;
    setBusy(true);
    setNotice(null);
    setJob(null);
    setProgress(8);

    const timer = window.setInterval(() => {
      setProgress((value) => (value >= 90 ? value : value + 3));
    }, 900);

    try {
      const response = await fetch(`/api/projects/${project.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aspectRatio }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not start export.");

      if (data.status === "completed" || data.outputUrl) {
        setProgress(100);
        setNoticeVariant("success");
        setNotice(data.message || "Export complete.");
        await loadExportState(project.id);
        return;
      }

      const first = await pollJob(data.jobId);
      setJob(first);
      if (first.status === "completed") {
        setNoticeVariant("success");
        setNotice(first.message || "Export complete.");
        await loadExportState(project.id);
      } else if (first.status === "failed") {
        setNoticeVariant("error");
        setNotice(first.error || "Export failed.");
      } else {
        return;
      }
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Could not start export.");
    } finally {
      window.clearInterval(timer);
      setBusy(false);
    }
  }

  const outputUrl = job?.outputUrl || latestExport?.output_url || null;
  const readyForExport = Boolean(pipeline?.readyForExport);

  if (!project) {
    return (
      <Card className="border-white/10 bg-card/60">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Export</CardTitle>
          <CardDescription>Render your final MP4 when the pipeline is complete.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <ModuleLink href="/dashboard/script">Go to Script</ModuleLink>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <ModuleHeader
          step="Module 06 · Export"
          title="Render your final video"
          description="Mix your visuals, voiceover, captions, and music into a downloadable MP4."
        />
        <Button onClick={() => void renderVideo()} disabled={busy || !readyForExport}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Render video
        </Button>
      </div>

      {notice ? <WorkspaceNotice message={notice} variant={noticeVariant} /> : null}

      {!readyForExport ? (
        <Card className="border-dashed border-white/15 bg-card/40">
          <CardContent className="space-y-3 py-8">
            <p className="text-sm text-muted-foreground">
              Complete visuals and voiceover before exporting. Optionally refine captions and music in Edit.
            </p>
            <div className="flex flex-wrap gap-2">
              {!pipeline?.hasVisuals ? (
                <Button asChild variant="secondary" size="sm">
                  <ModuleLink href="/dashboard/visuals">Go to Visuals</ModuleLink>
                </Button>
              ) : null}
              {!pipeline?.hasVoice ? (
                <Button asChild variant="secondary" size="sm">
                  <ModuleLink href="/dashboard/voice">Go to Voice</ModuleLink>
                </Button>
              ) : null}
              <Button asChild variant="secondary" size="sm">
                <ModuleLink href="/dashboard/edit">Go to Edit</ModuleLink>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Film className="h-5 w-5 text-forge" />
              Render progress
            </CardTitle>
            <CardDescription>
              {busy
                ? "Keep this tab open while the final MP4 is encoded."
                : "Start a render to generate your downloadable MP4."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {busy ? (
              <JobProgressCard
                message={job?.message || "Mixing visuals, voice, and captions…"}
                progress={job?.progress || progress}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Latest export status:{" "}
                <span className="text-foreground">{latestExport?.status ?? "none yet"}</span>
              </p>
            )}

            {outputUrl ? (
              <div className="space-y-3 rounded-xl border border-white/10 bg-black/30 p-4">
                <video src={outputUrl} controls className="w-full rounded-lg bg-black" />
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <a href={outputUrl} download={`${project.title || "reelforge-export"}.mp4`}>
                      <Download className="mr-2 h-4 w-4" />
                      Download MP4
                    </a>
                  </Button>
                  <Button asChild variant="secondary">
                    <a href={outputUrl} target="_blank" rel="noreferrer">
                      <Play className="mr-2 h-4 w-4" />
                      Open in new tab
                    </a>
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="text-lg">Export preset</CardTitle>
            <CardDescription>Choose the target platform aspect ratio.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {ASPECT_RATIO_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={busy}
                onClick={() => setAspectRatio(option.value)}
                className={`w-full rounded-lg border px-3 py-3 text-left text-sm transition ${
                  aspectRatio === option.value
                    ? "border-forge bg-forge/10"
                    : "border-white/10 hover:border-white/25"
                }`}
              >
                <p className="font-medium">{option.label}</p>
                <p className="text-xs text-muted-foreground">
                  {option.value === "16:9"
                    ? "Standard YouTube landscape"
                    : option.value === "9:16"
                      ? "Shorts / Reels vertical"
                      : "Square social posts"}
                </p>
              </button>
            ))}

            <p className="pt-2 text-xs text-muted-foreground">
              Export uses your Module 02 video plus Module 03 voice, with Edit captions and music when present.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
