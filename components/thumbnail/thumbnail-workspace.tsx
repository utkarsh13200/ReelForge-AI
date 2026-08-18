"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, CloudUpload, ImageIcon, ImagePlus, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ThumbnailCanvasEditor } from "@/components/thumbnail/thumbnail-canvas-editor";
import { ModuleHeader } from "@/components/dashboard/module-header";
import { WorkspaceNotice } from "@/components/dashboard/workspace-notice";
import { JobProgressCard } from "@/components/dashboard/job-progress-card";
import { useWorkspaceProject } from "@/hooks/use-workspace-project";
import type { Project } from "@/lib/types/project";
import type { Thumbnail, ThumbnailOverlay } from "@/lib/types/thumbnail";

const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov";
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

export function ThumbnailWorkspace({ initialProject }: { initialProject: Project | null }) {
  const { project, setProject, activeProjectId } = useWorkspaceProject(initialProject);
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [headline, setHeadline] = useState("");
  const [prompt, setPrompt] = useState(initialProject?.source_url || "");
  const [headlineInput, setHeadlineInput] = useState("");
  const [useProjectVideo, setUseProjectVideo] = useState(Boolean(initialProject?.visual_video_url));
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeVariant, setNoticeVariant] = useState<"info" | "success" | "error">("info");
  const [progress, setProgress] = useState(0);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const selectedThumbnail = useMemo(
    () => thumbnails.find((row) => row.id === selectedId) ?? null,
    [thumbnails, selectedId]
  );
  const savedThumbnail = useMemo(
    () => thumbnails.find((row) => row.is_selected) ?? null,
    [thumbnails]
  );
  const hasProjectVideo = Boolean(project?.visual_video_url);

  const loadThumbnails = useCallback(async (projectId: string) => {
    const response = await fetch(`/api/projects/${projectId}/thumbnail`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load thumbnails.");
    setProject(data.project);
    setThumbnails(data.thumbnails ?? []);
    if (data.selectedThumbnail) {
      setSelectedId(data.selectedThumbnail.id);
      setHeadline(data.selectedThumbnail.headline || data.selectedThumbnail.overlay_json?.text || "");
    } else if (data.thumbnails?.length) {
      setSelectedId(data.thumbnails[0].id);
      setHeadline(data.thumbnails[0].headline || "");
    }
  }, [setProject]);

  useEffect(() => {
    if (project?.id) {
      loadThumbnails(project.id).catch((error) => {
        setNoticeVariant("error");
        setNotice(error instanceof Error ? error.message : "Could not load thumbnails.");
      });
    }
  }, [project?.id, activeProjectId, loadThumbnails]);

  useEffect(() => {
    setUseProjectVideo(Boolean(project?.visual_video_url));
    setPrompt((current) => {
      if (current.trim()) return current;
      return project?.source_url || "";
    });
  }, [project?.id, project?.visual_video_url, project?.source_url]);

  async function generateCandidates() {
    if (!project?.id) return;
    setBusy(true);
    setNotice(null);
    setProgress(12);

    const formData = new FormData();
    formData.append("description", prompt);
    formData.append("headline", headlineInput);
    formData.append("useProjectVideo", String(useProjectVideo && hasProjectVideo && !videoFile));
    if (videoFile) formData.append("video", videoFile);
    if (referenceFile) formData.append("reference", referenceFile);

    const timer = window.setInterval(() => {
      setProgress((value) => (value >= 90 ? value : value + 4));
    }, 800);

    try {
      const response = await fetch(`/api/projects/${project.id}/thumbnail/generate`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not generate thumbnails.");

      setProgress(100);
      setHeadline(data.headline || headlineInput);
      if (data.thumbnails?.length) {
        setThumbnails(data.thumbnails);
        setSelectedId(data.thumbnails[0].id);
      } else if (project.id) {
        await loadThumbnails(project.id);
      }
      setNoticeVariant("success");
      setNotice(data.headline ? `Ready. Add overlay text in the canvas editor.` : "Thumbnail candidates ready.");
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Could not generate thumbnails.");
    } finally {
      window.clearInterval(timer);
      setBusy(false);
    }
  }

  async function saveThumbnail(blob: Blob, overlay: ThumbnailOverlay) {
    if (!project?.id || !selectedId) return;
    setSaving(true);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.append("file", blob, "thumbnail.png");
      formData.append("overlay", JSON.stringify(overlay));

      const response = await fetch(`/api/projects/${project.id}/thumbnail/${selectedId}`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save thumbnail.");

      setNoticeVariant("success");
      setNotice("Thumbnail saved to your project.");
      await loadThumbnails(project.id);
    } catch (error) {
      setNoticeVariant("error");
      setNotice(error instanceof Error ? error.message : "Could not save thumbnail.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <ModuleHeader
        step="Module 04 · Thumbnail"
        title="Design the reason they pause"
        description="Start with a description, YouTube URL, or video — then pick a candidate and add bold overlay text."
      />

      <Card className="border-white/10 bg-card/60">
        <CardHeader className="space-y-1">
          <CardTitle className="font-display text-2xl">Create a thumbnail</CardTitle>
          <CardDescription>Start with a description, YouTube URL, or video file.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="thumbnail-prompt">Description or YouTube URL</Label>
            <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
              <Textarea
                id="thumbnail-prompt"
                className="min-h-[140px] rounded-none border-0 bg-transparent focus-visible:ring-0"
                placeholder="Describe the thumbnail you want, or paste a YouTube video URL"
                value={prompt}
                disabled={busy}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void generateCandidates();
                  }
                }}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-2 text-xs text-muted-foreground">
                <span>Include the subject, mood, and any text.</span>
                <span>Enter to generate</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="thumbnail-headline">Headline text (optional)</Label>
            <Input
              id="thumbnail-headline"
              placeholder="Bold overlay words — you can still edit these later"
              value={headlineInput}
              disabled={busy}
              onChange={(event) => setHeadlineInput(event.target.value)}
            />
          </div>

          <div className="space-y-3">
            <Label>Add source material (optional)</Label>
            {hasProjectVideo ? (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={useProjectVideo && !videoFile}
                  onChange={(event) => setUseProjectVideo(event.target.checked)}
                  disabled={busy || Boolean(videoFile)}
                  className="accent-forge"
                />
                Use this project’s video from Visuals
              </label>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <input
                ref={videoInputRef}
                type="file"
                accept={VIDEO_ACCEPT}
                className="hidden"
                onChange={(event) => {
                  setVideoFile(event.target.files?.[0] ?? null);
                  if (event.target.files?.[0]) setUseProjectVideo(false);
                }}
              />
              <input
                ref={imageInputRef}
                type="file"
                accept={IMAGE_ACCEPT}
                className="hidden"
                onChange={(event) => setReferenceFile(event.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => videoInputRef.current?.click()}
              >
                <CloudUpload className="h-4 w-4" />
                {videoFile ? videoFile.name : "Upload video"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => imageInputRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" />
                {referenceFile ? referenceFile.name : "Reference image"}
              </Button>
              {videoFile || referenceFile ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setVideoFile(null);
                    setReferenceFile(null);
                    if (videoInputRef.current) videoInputRef.current.value = "";
                    if (imageInputRef.current) imageInputRef.current.value = "";
                    setUseProjectVideo(hasProjectVideo);
                  }}
                >
                  Clear files
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Video: MP4, WebM, or MOV up to 40MB. Reference images become a candidate plus AI variants.
              {hasProjectVideo ? " Project video stills are used when the box is checked." : ""}
            </p>
          </div>

          <Button className="w-full rounded-full" size="lg" onClick={() => void generateCandidates()} disabled={busy || !project?.id}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate thumbnail
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      {notice ? <WorkspaceNotice message={notice} variant={noticeVariant} /> : null}

      {busy ? (
        <JobProgressCard
          message="Generating thumbnail candidates from your prompt and source material…"
          progress={progress}
        />
      ) : null}

      {savedThumbnail?.url ? (
        <Card className="border-forge/30 bg-forge/5">
          <CardContent className="flex flex-wrap items-center gap-4 pt-6">
            <div className="relative h-20 w-36 overflow-hidden rounded-md border border-white/10">
              <Image src={savedThumbnail.url} alt="Saved thumbnail" fill className="object-cover" unoptimized />
            </div>
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-forge">
                <Check className="h-4 w-4" />
                Saved project thumbnail
              </p>
              <p className="text-sm text-muted-foreground">
                {savedThumbnail.headline || savedThumbnail.overlay_json?.text || "Custom headline"}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {thumbnails.length ? (
        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ImageIcon className="h-5 w-5 text-forge" />
              Candidates
            </CardTitle>
            <CardDescription>Pick a background, then tune the headline overlay.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {thumbnails.map((thumbnail, index) => (
                <button
                  key={thumbnail.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(thumbnail.id);
                    setHeadline(thumbnail.headline || headline);
                  }}
                  className={`overflow-hidden rounded-xl border text-left transition ${
                    selectedId === thumbnail.id
                      ? "border-forge ring-2 ring-forge/40"
                      : "border-white/10 hover:border-white/25"
                  }`}
                >
                  <div className="relative aspect-video bg-black/40">
                    {thumbnail.url ? (
                      <Image
                        src={thumbnail.url}
                        alt={`Candidate ${index + 1}`}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        Generating…
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Candidate {index + 1}</p>
                    <p className="line-clamp-2 text-sm">{thumbnail.prompt}</p>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed border-white/15 bg-card/40">
          <CardContent className="flex flex-col items-start gap-3 py-10">
            <Wand2 className="h-8 w-8 text-forge" />
            <p className="text-sm text-muted-foreground">
              No candidates yet. Describe a look, paste a YouTube URL, or pull stills from your video.
            </p>
          </CardContent>
        </Card>
      )}

      {selectedThumbnail?.url ? (
        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="text-lg">Canvas editor</CardTitle>
            <CardDescription>
              Big text, strong stroke, high contrast — drag to position, then save to your project.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ThumbnailCanvasEditor
              imageUrl={selectedThumbnail.url}
              headline={headline || headlineInput || project?.title || "WATCH THIS"}
              initialOverlay={selectedThumbnail.overlay_json}
              saving={saving}
              onSave={saveThumbnail}
            />
          </CardContent>
        </Card>
      ) : null}

      {!project?.id ? (
        <WorkspaceNotice message="Create or open a project first, then generate a thumbnail." variant="info" />
      ) : null}
    </div>
  );
}
