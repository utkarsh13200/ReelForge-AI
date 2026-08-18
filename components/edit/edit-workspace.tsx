"use client";

import { ModuleLink } from "@/components/dashboard/module-nav";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Film,
  GripVertical,
  Loader2,
  Mic2,
  Music2,
  Save,
  Subtitles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motionRenderNote } from "@/lib/video-gen";
import { BUNDLED_MUSIC } from "@/lib/timeline/bundled-music";
import { normalizeTimeline, recomputeSceneTiming } from "@/lib/timeline/recompute";
import type { Project } from "@/lib/types/project";
import {
  ASPECT_RATIO_OPTIONS,
  type BackgroundMusic,
  type CaptionStyle,
  type TimelineJson,
  type TimelineScene,
} from "@/lib/types/timeline";
import type { VisualAsset, VisualMode } from "@/lib/types/visual";
import type { VoiceAsset } from "@/lib/types/voice";
import { ModuleHeader } from "@/components/dashboard/module-header";
import { useWorkspaceProject } from "@/hooks/use-workspace-project";

function formatTime(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function EditWorkspace({ initialProject }: { initialProject: Project | null }) {
  const { project, setProject, activeProjectId } = useWorkspaceProject(initialProject);
  const [visualAssets, setVisualAssets] = useState<VisualAsset[]>([]);
  const [voiceAsset, setVoiceAsset] = useState<VoiceAsset | null>(null);
  const [timeline, setTimeline] = useState<TimelineJson | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragSceneId, setDragSceneId] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);

  const selectedScene = useMemo(
    () => timeline?.scenes.find((scene) => scene.id === selectedSceneId) ?? null,
    [timeline, selectedSceneId]
  );

  const readyScenes = timeline?.scenes.filter((scene) => scene.url) ?? [];
  const totalDuration = timeline?.totalDurationSeconds ?? 1;

  const loadEditState = useCallback(async (projectId: string) => {
    const response = await fetch(`/api/projects/${projectId}/edit`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load edit data.");
    setProject(data.project);
    setVisualAssets(data.visualAssets ?? []);
    setVoiceAsset(data.voiceAsset ?? null);
    setTimeline(data.timeline ?? null);
    if (data.timeline?.scenes?.length) setSelectedSceneId(data.timeline.scenes[0].id);
  }, [setProject]);

  useEffect(() => {
    if (project?.id) {
      loadEditState(project.id).catch((error) => {
        setNotice(error instanceof Error ? error.message : "Could not load edit data.");
      });
    }
  }, [project?.id, activeProjectId, loadEditState]);

  const persistTimeline = useCallback(async (nextTimeline: TimelineJson, silent = false) => {
    if (!project?.id) return;
    if (!silent) setSaving(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/timeline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeline: nextTimeline }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save timeline.");
      setProject(data.project);
      if (!silent) setNotice("Timeline saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save timeline.");
    } finally {
      if (!silent) setSaving(false);
    }
  }, [project?.id, setProject]);

  const updateTimeline = useCallback(
    (updater: (current: TimelineJson) => TimelineJson, autosave = true) => {
      setTimeline((current) => {
        if (!current) return current;
        const next = normalizeTimeline(updater(current));
        if (autosave && project?.id) {
          if (saveTimer.current) window.clearTimeout(saveTimer.current);
          saveTimer.current = window.setTimeout(() => {
            void persistTimeline(next, true);
          }, 1500);
        }
        return next;
      });
    },
    [persistTimeline, project?.id]
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  function reorderScenes(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    updateTimeline((current) => {
      const scenes = [...current.scenes];
      const fromIndex = scenes.findIndex((scene) => scene.id === sourceId);
      const toIndex = scenes.findIndex((scene) => scene.id === targetId);
      if (fromIndex < 0 || toIndex < 0) return current;
      const [moved] = scenes.splice(fromIndex, 1);
      scenes.splice(toIndex, 0, moved);
      return { ...current, scenes: recomputeSceneTiming(scenes) };
    });
  }

  function updateScene(sceneId: string, patch: Partial<TimelineScene>) {
    updateTimeline((current) => ({
      ...current,
      scenes: recomputeSceneTiming(
        current.scenes.map((scene) => (scene.id === sceneId ? { ...scene, ...patch } : scene))
      ),
    }));
  }

  function deleteScene(sceneId: string) {
    updateTimeline((current) => ({
      ...current,
      scenes: recomputeSceneTiming(current.scenes.filter((scene) => scene.id !== sceneId)),
    }));
    if (selectedSceneId === sceneId) setSelectedSceneId(null);
  }

  function swapSceneAsset(sceneId: string, assetId: string) {
    const asset = visualAssets.find((row) => row.id === assetId);
    if (!asset?.url) return;
    updateScene(sceneId, {
      assetId: asset.id,
      url: asset.url,
      title: asset.scene_title || `Scene ${asset.scene_index + 1}`,
      mode: asset.mode,
    });
  }

  function updateCaptionStyle(patch: Partial<CaptionStyle>) {
    updateTimeline((current) => {
      if (!current.captions) return current;
      return {
        ...current,
        captions: {
          ...current.captions,
          style: { ...current.captions.style, ...patch },
        },
      };
    });
  }

  function setMusic(music: BackgroundMusic | null) {
    updateTimeline((current) => ({ ...current, music }));
  }

  async function uploadMusic(file: File) {
    if (!project?.id) return;
    setBusy(true);
    setNotice(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/projects/${project.id}/timeline/music`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not upload music.");
      setMusic(data.music);
      setNotice(`Added background track: ${data.music.name}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not upload music.");
    } finally {
      setBusy(false);
    }
  }

  const missingVisuals = visualAssets.filter((asset) => asset.url).length === 0 && !project?.visual_video_url;
  const missingVoice = !voiceAsset?.audio_url;

  if (!project) {
    return (
      <Card className="border-white/10 bg-card/60">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Edit</CardTitle>
          <CardDescription>Start a project in Script to unlock the timeline editor.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <ModuleLink href="/dashboard/script">Go to Script</ModuleLink>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (missingVisuals || missingVoice) {
    return (
      <Card className="border-white/10 bg-card/60">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Edit</CardTitle>
          <CardDescription>Build your visual and voice tracks before editing the timeline.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          {missingVisuals ? <p>Generate scene visuals in Module 2.</p> : null}
          {missingVoice ? <p>Generate a voiceover in Module 3.</p> : null}
          <div className="flex flex-wrap gap-2 pt-2">
            {missingVisuals ? (
              <Button asChild variant="secondary">
                <ModuleLink href="/dashboard/visuals">Go to Visuals</ModuleLink>
              </Button>
            ) : null}
            {missingVoice ? (
              <Button asChild variant="secondary">
                <ModuleLink href="/dashboard/voice">Go to Voice</ModuleLink>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!timeline) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading timeline…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <ModuleHeader
          step="Module 05 · Edit"
          title="Shape the final cut"
          description="Reorder scenes, trim durations, style captions, and mix background music before export."
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={timeline.aspectRatio}
            onChange={(event) =>
              updateTimeline((current) => ({
                ...current,
                aspectRatio: event.target.value as TimelineJson["aspectRatio"],
              }))
            }
            className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm"
          >
            {ASPECT_RATIO_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button disabled={saving} onClick={() => void persistTimeline(timeline)}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save timeline
          </Button>
        </div>
      </div>

      {notice ? (
        <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm">{notice}</div>
      ) : null}

      <Card className="border-white/10 bg-card/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Film className="h-5 w-5 text-forge" />
            Scene timeline
          </CardTitle>
          <CardDescription>
            Drag clips to reorder. Total runtime {formatTime(totalDuration)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="flex min-w-[720px] gap-1">
              {readyScenes.map((scene) => {
                const widthPercent = (scene.durationSeconds / totalDuration) * 100;
                return (
                  <button
                    key={scene.id}
                    type="button"
                    draggable
                    onDragStart={() => setDragSceneId(scene.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (dragSceneId) reorderScenes(dragSceneId, scene.id);
                      setDragSceneId(null);
                    }}
                    onClick={() => setSelectedSceneId(scene.id)}
                    className={`group relative h-24 overflow-hidden rounded-lg border text-left transition ${
                      selectedSceneId === scene.id
                        ? "border-forge ring-2 ring-forge/40"
                        : "border-white/10 hover:border-white/25"
                    }`}
                    style={{ width: `${Math.max(widthPercent, 8)}%` }}
                  >
                    {scene.url && (scene.mode === "video" || scene.url.includes(".mp4")) ? (
                      <video src={scene.url} muted className="absolute inset-0 h-full w-full object-cover" />
                    ) : scene.url ? (
                      <Image src={scene.url} alt={scene.title} fill className="object-cover" unoptimized />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute left-2 top-2 rounded bg-black/50 p-1 text-white/80">
                      <GripVertical className="h-3.5 w-3.5" />
                    </div>
                    <div className="absolute bottom-2 left-2 right-2">
                      <p className="truncate text-xs font-medium">{scene.title}</p>
                      <p className="text-[10px] text-white/70">
                        {formatTime(scene.startSeconds)} · {scene.durationSeconds.toFixed(1)}s
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <Mic2 className="h-3.5 w-3.5" />
              Voice track
            </div>
            <div className="h-10 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
              {timeline.voiceTrack?.url ? (
                <span>
                  Narration · {formatTime(timeline.voiceTrack.durationSeconds)} · {voiceAsset?.voice_id}
                </span>
              ) : (
                "No voice track"
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <Subtitles className="h-3.5 w-3.5" />
              Caption track
            </div>
            <div className="min-h-10 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2">
              {timeline.captions?.words?.length ? (
                <p className="line-clamp-2 text-sm text-white/90">
                  {timeline.captions.words.slice(0, 24).map((word) => word.word).join(" ")}
                  {timeline.captions.words.length > 24 ? "…" : ""}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Captions will render from voice word timings at export.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="text-lg">Scene controls</CardTitle>
            <CardDescription>
              {selectedScene ? `Editing ${selectedScene.title}` : "Select a scene clip above."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedScene ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="scene-duration">
                    Duration ({selectedScene.durationSeconds.toFixed(1)}s)
                  </Label>
                  <input
                    id="scene-duration"
                    type="range"
                    min={1}
                    max={30}
                    step={0.5}
                    value={selectedScene.durationSeconds}
                    onChange={(event) =>
                      updateScene(selectedScene.id, { durationSeconds: Number(event.target.value) })
                    }
                    className="w-full accent-forge"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Motion mode</Label>
                  <div className="flex gap-2">
                    {(["image", "motion"] as VisualMode[]).map((mode) => (
                      <Button
                        key={mode}
                        type="button"
                        size="sm"
                        variant={selectedScene.mode === mode ? "default" : "secondary"}
                        onClick={() => updateScene(selectedScene.id, { mode })}
                      >
                        {mode === "motion" ? "Motion" : "Still"}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{motionRenderNote(selectedScene.mode)}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="swap-asset">Swap visual asset</Label>
                  <select
                    id="swap-asset"
                    value={selectedScene.assetId}
                    onChange={(event) => swapSceneAsset(selectedScene.id, event.target.value)}
                    className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm"
                  >
                    {visualAssets
                      .filter((asset) => asset.url)
                      .map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          Scene {asset.scene_index + 1} · {asset.scene_title || "Untitled"}
                        </option>
                      ))}
                  </select>
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  className="text-red-300 hover:text-red-200"
                  onClick={() => deleteScene(selectedScene.id)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove from timeline
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Click a scene block to edit trim, mode, or asset.</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-white/10 bg-card/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Subtitles className="h-5 w-5 text-forge" />
                Captions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {timeline.captions ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="caption-size">Font size ({timeline.captions.style.fontSize}px)</Label>
                    <input
                      id="caption-size"
                      type="range"
                      min={24}
                      max={72}
                      value={timeline.captions.style.fontSize}
                      onChange={(event) => updateCaptionStyle({ fontSize: Number(event.target.value) })}
                      className="w-full accent-forge"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="caption-color">Text color</Label>
                    <Input
                      id="caption-color"
                      type="color"
                      value={timeline.captions.style.color}
                      onChange={(event) => updateCaptionStyle({ color: event.target.value })}
                      className="h-10 cursor-pointer p-1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Position</Label>
                    <div className="flex flex-wrap gap-2">
                      {(["bottom", "center", "top"] as const).map((position) => (
                        <Button
                          key={position}
                          type="button"
                          size="sm"
                          variant={timeline.captions?.style.position === position ? "default" : "secondary"}
                          onClick={() => updateCaptionStyle({ position })}
                        >
                          {position}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={timeline.captions.style.highlightCurrentWord}
                      onChange={(event) => updateCaptionStyle({ highlightCurrentWord: event.target.checked })}
                      className="accent-forge"
                    />
                    Highlight current word (Shorts style)
                  </label>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Generate voiceover to unlock caption styling.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-card/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Music2 className="h-5 w-5 text-forge" />
                Background music
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {BUNDLED_MUSIC.map((track) => (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() =>
                      setMusic({
                        source: "bundled",
                        url: track.url,
                        name: track.name,
                        volume: timeline.music?.volume ?? 0.35,
                      })
                    }
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                      timeline.music?.url === track.url
                        ? "border-forge bg-forge/10"
                        : "border-white/10 hover:border-white/25"
                    }`}
                  >
                    <p className="font-medium">{track.name}</p>
                    <p className="text-xs text-muted-foreground">{track.mood}</p>
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <Label htmlFor="music-upload">Upload MP3</Label>
                <Input
                  id="music-upload"
                  type="file"
                  accept="audio/*,.mp3"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadMusic(file);
                  }}
                />
              </div>

              {timeline.music ? (
                <>
                  <p className="text-sm">
                    Active: <span className="text-foreground">{timeline.music.name}</span>
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="music-volume">
                      Volume vs voice ({Math.round(timeline.music.volume * 100)}%)
                    </Label>
                    <input
                      id="music-volume"
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={timeline.music.volume}
                      onChange={(event) =>
                        setMusic({ ...timeline.music!, volume: Number(event.target.value) })
                      }
                      className="w-full accent-forge"
                    />
                  </div>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setMusic(null)}>
                    Remove music
                  </Button>
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
