"use client";

import { ModuleLink } from "@/components/dashboard/module-nav";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Film,
  FolderOpen,
  ImagePlus,
  Loader2,
  Mic2,
  Music2,
  Pause,
  Play,
  Save,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  Subtitles,
  Trash2,
  Type,
  Volume2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BUNDLED_MUSIC } from "@/lib/timeline/bundled-music";
import { cssFilterFromEffects, normalizeEffects } from "@/lib/timeline/effects";
import { normalizeTimeline, recomputeSceneTiming } from "@/lib/timeline/recompute";
import type { Project } from "@/lib/types/project";
import {
  ASPECT_RATIO_OPTIONS,
  DEFAULT_TIMELINE_EFFECTS,
  QUICK_STYLE_OPTIONS,
  type BackgroundMusic,
  type CaptionStyle,
  type TimelineEffects,
  type TimelineJson,
  type TimelineQuickStyle,
  type TimelineScene,
} from "@/lib/types/timeline";
import type { VisualAsset, VisualMode } from "@/lib/types/visual";
import type { VoiceAsset } from "@/lib/types/voice";
import { useWorkspaceProject } from "@/hooks/use-workspace-project";

type LeftTab = "templates" | "objects" | "project";
type ToolPanel = "images" | "music" | "effects" | "text" | null;

function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  const ms = Math.floor((Math.max(0, seconds) - total) * 100);
  return `${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}.${ms
    .toString()
    .padStart(2, "0")}`;
}

function sceneAtTime(scenes: TimelineScene[], time: number) {
  return (
    scenes.find((scene) => time >= scene.startSeconds && time < scene.startSeconds + scene.durationSeconds) ??
    scenes[scenes.length - 1] ??
    null
  );
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
  const [leftTab, setLeftTab] = useState<LeftTab>("templates");
  const [toolPanel, setToolPanel] = useState<ToolPanel>("images");
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [search, setSearch] = useState("");
  const saveTimer = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const voiceRef = useRef<HTMLAudioElement | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const musicInputRef = useRef<HTMLInputElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const selectedScene = useMemo(
    () => timeline?.scenes.find((scene) => scene.id === selectedSceneId) ?? null,
    [timeline, selectedSceneId]
  );

  const readyScenes = timeline?.scenes.filter((scene) => scene.url) ?? [];
  const totalDuration = timeline?.totalDurationSeconds ?? 1;
  const effects = normalizeEffects(timeline?.effects);
  const previewFilter = cssFilterFromEffects(effects);
  const activeScene = sceneAtTime(readyScenes, playhead);
  const assembledUrl = project?.visual_video_url ?? null;

  const loadEditState = useCallback(
    async (projectId: string) => {
      const response = await fetch(`/api/projects/${projectId}/edit`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load edit data.");
      setProject(data.project);
      setVisualAssets(data.visualAssets ?? []);
      setVoiceAsset(data.voiceAsset ?? null);
      setTimeline(data.timeline ?? null);
      if (data.timeline?.scenes?.length) setSelectedSceneId(data.timeline.scenes[0].id);
    },
    [setProject]
  );

  useEffect(() => {
    if (project?.id) {
      loadEditState(project.id).catch((error) => {
        setNotice(error instanceof Error ? error.message : "Could not load edit data.");
      });
    }
  }, [project?.id, activeProjectId, loadEditState]);

  const persistTimeline = useCallback(
    async (nextTimeline: TimelineJson, silent = false) => {
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
    },
    [project?.id, setProject]
  );

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
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const voice = voiceRef.current;
    const music = musicRef.current;
    const video = videoRef.current;
    if (!playing) {
      voice?.pause();
      music?.pause();
      video?.pause();
      return;
    }

    const tick = () => {
      const source = video?.src ? video : voice;
      const time = source?.currentTime ?? playhead;
      setPlayhead(time);
      if (music && timeline?.music?.url) {
        if (Math.abs(music.currentTime - time) > 0.35) music.currentTime = time;
        music.volume = Math.min(1, Math.max(0, timeline.music.volume ?? 0.35));
        if (music.paused) void music.play().catch(() => undefined);
      }
      if (voice && video?.src && Math.abs(voice.currentTime - time) > 0.35) {
        voice.currentTime = time;
      }
      if (voice && voice.paused && voice.src) void voice.play().catch(() => undefined);
      if (time >= totalDuration - 0.05) {
        setPlaying(false);
        setPlayhead(0);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    if (video?.src) {
      video.currentTime = playhead;
      void video.play().catch(() => undefined);
    }
    if (voice?.src) {
      voice.currentTime = playhead;
      void voice.play().catch(() => undefined);
    }
    if (music?.src && timeline?.music?.url) {
      music.currentTime = playhead;
      music.volume = timeline.music.volume ?? 0.35;
      void music.play().catch(() => undefined);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, timeline?.music?.url, timeline?.music?.volume, totalDuration]);

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

  function addAssetToTimeline(asset: VisualAsset) {
    if (!asset.url || !timeline) return;
    if (timeline.scenes.some((scene) => scene.assetId === asset.id)) {
      setSelectedSceneId(asset.id);
      setNotice("Image is already on the timeline.");
      return;
    }
    updateTimeline((current) => ({
      ...current,
      scenes: recomputeSceneTiming([
        ...current.scenes,
        {
          id: `${asset.id}-${Date.now()}`,
          assetId: asset.id,
          sceneIndex: current.scenes.length,
          title: asset.scene_title || `Image ${current.scenes.length + 1}`,
          url: asset.url || "",
          mode: asset.mode || "image",
          startSeconds: 0,
          durationSeconds: 4,
        },
      ]),
    }));
    setNotice(`Added ${asset.scene_title || "image"} to timeline.`);
    setToolPanel("images");
  }

  function addUploadedImage(image: { id: string; url: string; title: string }) {
    updateTimeline((current) => ({
      ...current,
      scenes: recomputeSceneTiming([
        ...current.scenes,
        {
          id: image.id,
          assetId: image.id,
          sceneIndex: current.scenes.length,
          title: image.title,
          url: image.url,
          mode: "image",
          startSeconds: 0,
          durationSeconds: 4,
        },
      ]),
    }));
    setSelectedSceneId(image.id);
    setNotice(`Added image: ${image.title}`);
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

  function setEffects(patch: Partial<TimelineEffects>) {
    updateTimeline((current) => ({
      ...current,
      effects: normalizeEffects({ ...(current.effects ?? DEFAULT_TIMELINE_EFFECTS), ...patch }),
    }));
  }

  function applyQuickStyle(style: TimelineQuickStyle) {
    setEffects({ quickStyle: style });
    setToolPanel("effects");
    setNotice(style === "none" ? "Cleared quick style." : `Applied ${style.replace("-", " ")} style.`);
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
      setToolPanel("music");
      setNotice(`Added background track: ${data.music.name}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not upload music.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadImage(file: File) {
    if (!project?.id) return;
    setBusy(true);
    setNotice(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/projects/${project.id}/timeline/image`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not upload image.");
      addUploadedImage(data.image);
      setToolPanel("images");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not upload image.");
    } finally {
      setBusy(false);
    }
  }

  function seekTo(time: number) {
    const next = Math.max(0, Math.min(totalDuration, time));
    setPlayhead(next);
    if (videoRef.current?.src) videoRef.current.currentTime = next;
    if (voiceRef.current?.src) voiceRef.current.currentTime = next;
    if (musicRef.current?.src) musicRef.current.currentTime = next;
  }

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (playhead >= totalDuration - 0.05) seekTo(0);
    setPlaying(true);
  }

  const missingVisuals = visualAssets.filter((asset) => asset.url).length === 0 && !project?.visual_video_url;
  const missingVoice = !voiceAsset?.audio_url;

  const filteredAssets = visualAssets.filter((asset) => {
    if (!asset.url) return false;
    if (!search.trim()) return true;
    const hay = `${asset.scene_title || ""} ${asset.prompt || ""}`.toLowerCase();
    return hay.includes(search.trim().toLowerCase());
  });

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

  const previewUrl = assembledUrl || activeScene?.url || selectedScene?.url || "";
  const previewIsVideo = Boolean(
    assembledUrl ||
      (previewUrl && (activeScene?.mode === "video" || /\.mp4($|\?)/i.test(previewUrl)))
  );

  return (
    <div className="-mx-4 -mb-4 flex h-[calc(100vh-3.5rem-2rem)] min-h-[640px] flex-col overflow-hidden border border-white/10 bg-[#1b1b1b] text-[#e8e8e8] shadow-2xl md:-mx-8 md:-mb-8 md:h-[calc(100vh-3.5rem-4rem)]">
      {/* Top menu strip */}
      <div className="flex items-center gap-4 border-b border-white/10 bg-[#222] px-3 py-1.5 text-[11px] text-white/70">
        <span className="font-semibold text-forge">Module 05 · Editor</span>
        <span>Projects</span>
        <span>Scenes</span>
        <span className="text-white">Editor</span>
        <span>Export</span>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={timeline.aspectRatio}
            onChange={(event) =>
              updateTimeline((current) => ({
                ...current,
                aspectRatio: event.target.value as TimelineJson["aspectRatio"],
              }))
            }
            className="rounded border border-white/15 bg-black/40 px-2 py-1 text-[11px]"
          >
            {ASPECT_RATIO_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button size="sm" className="h-7 text-xs" disabled={saving} onClick={() => void persistTimeline(timeline)}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
        </div>
      </div>

      {/* Toolbar — Add object / effects / music / text */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#252525] px-3 py-2">
        <ToolbarButton
          active={toolPanel === "images"}
          label="Add object"
          hint="Images"
          onClick={() => setToolPanel(toolPanel === "images" ? null : "images")}
          icon={<ImagePlus className="h-5 w-5 text-emerald-400" />}
        />
        <ToolbarButton
          active={toolPanel === "effects"}
          label="Video effects"
          hint="Filters"
          onClick={() => setToolPanel(toolPanel === "effects" ? null : "effects")}
          icon={<Film className="h-5 w-5 text-sky-400" />}
        />
        <ToolbarButton
          active={toolPanel === "music"}
          label="Audio effects"
          hint="Music"
          onClick={() => setToolPanel(toolPanel === "music" ? null : "music")}
          icon={<Volume2 className="h-5 w-5 text-amber-400" />}
        />
        <ToolbarButton
          active={toolPanel === "text"}
          label="Text effects"
          hint="Captions"
          onClick={() => setToolPanel(toolPanel === "text" ? null : "text")}
          icon={<Type className="h-5 w-5 text-violet-300" />}
        />

        <div className="mx-2 hidden h-8 w-px bg-white/15 sm:block" />

        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-white/45">Quick style</span>
          {QUICK_STYLE_OPTIONS.map((style) => (
            <button
              key={style.value}
              type="button"
              onClick={() => applyQuickStyle(style.value)}
              className={`shrink-0 rounded border px-2 py-1 text-[11px] ${
                effects.quickStyle === style.value
                  ? "border-forge bg-forge/20 text-white"
                  : "border-white/10 bg-black/30 text-white/70 hover:border-white/25"
              }`}
            >
              {style.label}
            </button>
          ))}
        </div>
      </div>

      {notice ? (
        <div className="border-b border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white/80">{notice}</div>
      ) : null}

      {/* Main editor body */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_280px]">
        {/* Left templates / objects */}
        <aside className="flex min-h-0 flex-col border-r border-white/10 bg-[#1f1f1f]">
          <div className="flex border-b border-white/10 text-[11px]">
            {([
              ["templates", "Templates"],
              ["objects", "Objects"],
              ["project", "Project"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setLeftTab(id)}
                className={`flex-1 px-2 py-2 ${
                  leftTab === id ? "bg-[#2a2a2a] text-white" : "text-white/55 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="border-b border-white/10 p-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search templates…"
              className="h-8 border-white/10 bg-black/40 text-xs"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2 text-xs">
            {leftTab === "templates" ? (
              <div className="space-y-1">
                <TreeButton
                  label="Video effects"
                  active={toolPanel === "effects"}
                  onClick={() => setToolPanel("effects")}
                />
                <TreeButton
                  label="Audio effects"
                  active={toolPanel === "music"}
                  onClick={() => setToolPanel("music")}
                />
                <TreeButton
                  label="Text effects"
                  active={toolPanel === "text"}
                  onClick={() => setToolPanel("text")}
                />
                <TreeButton
                  label="Images / objects"
                  active={toolPanel === "images"}
                  onClick={() => setToolPanel("images")}
                />
                <div className="mt-3 space-y-1 border-t border-white/10 pt-2">
                  <p className="px-2 text-[10px] uppercase tracking-wide text-white/40">Bundled music</p>
                  {BUNDLED_MUSIC.filter((track) =>
                    !search.trim() ? true : track.name.toLowerCase().includes(search.trim().toLowerCase())
                  ).map((track) => (
                    <button
                      key={track.id}
                      type="button"
                      onClick={() => {
                        setMusic({
                          source: "bundled",
                          url: track.url,
                          name: track.name,
                          volume: timeline.music?.volume ?? 0.35,
                        });
                        setToolPanel("music");
                        setNotice(`Background music: ${track.name}`);
                      }}
                      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-white/5 ${
                        timeline.music?.url === track.url ? "bg-forge/15 text-forge" : ""
                      }`}
                    >
                      <Music2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{track.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {leftTab === "objects" ? (
              <div className="space-y-2">
                <p className="px-1 text-[10px] uppercase tracking-wide text-white/40">Project images</p>
                <div className="grid grid-cols-2 gap-2">
                  {filteredAssets.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => addAssetToTimeline(asset)}
                      className="overflow-hidden rounded border border-white/10 bg-black/30 text-left hover:border-forge/50"
                    >
                      <div className="relative aspect-video">
                        <Image src={asset.url!} alt="" fill className="object-cover" unoptimized />
                      </div>
                      <p className="truncate px-1.5 py-1 text-[10px] text-white/70">
                        {asset.scene_title || `Scene ${asset.scene_index + 1}`}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {leftTab === "project" ? (
              <div className="space-y-2 px-1 text-white/70">
                <p>
                  <span className="text-white/40">Title</span>
                  <br />
                  {project.title}
                </p>
                <p>
                  <span className="text-white/40">Scenes</span>
                  <br />
                  {readyScenes.length}
                </p>
                <p>
                  <span className="text-white/40">Duration</span>
                  <br />
                  {formatTime(totalDuration)}
                </p>
                <p>
                  <span className="text-white/40">Music</span>
                  <br />
                  {timeline.music?.name || "None"}
                </p>
              </div>
            ) : null}
          </div>
        </aside>

        {/* Center preview + tool drawer */}
        <section className="flex min-h-0 min-w-0 flex-col bg-[#141414]">
          {toolPanel ? (
            <div className="max-h-40 shrink-0 overflow-y-auto border-b border-white/10 bg-[#1c1c1c] p-3">
              {toolPanel === "images" ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-medium text-white/80">Images</p>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs"
                      disabled={busy}
                      onClick={() => imageInputRef.current?.click()}
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      Upload image
                    </Button>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadImage(file);
                        event.target.value = "";
                      }}
                    />
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {filteredAssets.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => addAssetToTimeline(asset)}
                        className="relative h-16 w-28 shrink-0 overflow-hidden rounded border border-white/15"
                      >
                        <Image src={asset.url!} alt="" fill className="object-cover" unoptimized />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {toolPanel === "music" ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-medium text-white/80">Background music</p>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs"
                      disabled={busy}
                      onClick={() => musicInputRef.current?.click()}
                    >
                      <Music2 className="h-3.5 w-3.5" />
                      Upload MP3
                    </Button>
                    <input
                      ref={musicInputRef}
                      type="file"
                      accept="audio/*,.mp3"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadMusic(file);
                        event.target.value = "";
                      }}
                    />
                    {timeline.music ? (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setMusic(null)}>
                        Remove
                      </Button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
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
                        className={`rounded border px-2 py-1 text-[11px] ${
                          timeline.music?.url === track.url
                            ? "border-forge bg-forge/15"
                            : "border-white/10 hover:border-white/25"
                        }`}
                      >
                        {track.name}
                      </button>
                    ))}
                  </div>
                  {timeline.music ? (
                    <div className="flex max-w-md items-center gap-3">
                      <Label className="shrink-0 text-[11px] text-white/55">
                        Volume {Math.round(timeline.music.volume * 100)}%
                      </Label>
                      <input
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
                  ) : null}
                </div>
              ) : null}

              {toolPanel === "effects" ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <EffectSlider
                    label="Brightness"
                    value={effects.brightness}
                    min={-100}
                    max={100}
                    onChange={(value) => setEffects({ brightness: value })}
                  />
                  <EffectSlider
                    label="Contrast"
                    value={effects.contrast}
                    min={-100}
                    max={100}
                    onChange={(value) => setEffects({ contrast: value })}
                  />
                  <EffectSlider
                    label="Gamma"
                    value={effects.gamma}
                    min={0.2}
                    max={3}
                    step={0.05}
                    onChange={(value) => setEffects({ gamma: value })}
                  />
                </div>
              ) : null}

              {toolPanel === "text" && timeline.captions ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-white/55">Caption size ({timeline.captions.style.fontSize}px)</Label>
                    <input
                      type="range"
                      min={24}
                      max={72}
                      value={timeline.captions.style.fontSize}
                      onChange={(event) => updateCaptionStyle({ fontSize: Number(event.target.value) })}
                      className="w-full accent-forge"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-white/55">Color</Label>
                    <Input
                      type="color"
                      value={timeline.captions.style.color}
                      onChange={(event) => updateCaptionStyle({ color: event.target.value })}
                      className="h-8 cursor-pointer p-1"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-white/55">Position</Label>
                    <div className="flex gap-1">
                      {(["bottom", "center", "top"] as const).map((position) => (
                        <Button
                          key={position}
                          type="button"
                          size="sm"
                          className="h-7 text-[10px]"
                          variant={timeline.captions?.style.position === position ? "default" : "secondary"}
                          onClick={() => updateCaptionStyle({ position })}
                        >
                          {position}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
              {toolPanel === "text" && !timeline.captions ? (
                <p className="text-xs text-white/55">Generate voiceover to unlock caption styling.</p>
              ) : null}
            </div>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-3">
            <div
              className="relative aspect-video w-full max-w-4xl overflow-hidden rounded border border-white/10 bg-black"
              style={{ filter: previewFilter }}
            >
              {previewIsVideo && previewUrl ? (
                <video
                  ref={videoRef}
                  key={assembledUrl || "scene-video"}
                  src={assembledUrl || previewUrl}
                  className="h-full w-full object-contain"
                  muted
                  playsInline
                  onTimeUpdate={(event) => {
                    if (!playing) setPlayhead(event.currentTarget.currentTime);
                  }}
                />
              ) : previewUrl ? (
                <Image src={previewUrl} alt="Preview" fill className="object-contain" unoptimized />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-white/40">No preview</div>
              )}
              {timeline.captions?.words?.length ? (
                <div
                  className={`pointer-events-none absolute inset-x-0 px-4 text-center ${
                    timeline.captions.style.position === "top"
                      ? "top-4"
                      : timeline.captions.style.position === "center"
                        ? "top-1/2 -translate-y-1/2"
                        : "bottom-6"
                  }`}
                >
                  <span
                    className="inline-block rounded px-2 py-1 font-semibold"
                    style={{
                      fontSize: Math.max(14, timeline.captions.style.fontSize * 0.35),
                      color: timeline.captions.style.color,
                      backgroundColor: timeline.captions.style.backgroundColor,
                    }}
                  >
                    {captionAtTime(timeline.captions.words, playhead)}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Button type="button" size="icon" variant="secondary" className="h-8 w-8" onClick={() => seekTo(0)}>
                <SkipBack className="h-4 w-4" />
              </Button>
              <Button type="button" size="icon" className="h-9 w-9" onClick={togglePlay}>
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="h-8 w-8"
                onClick={() => {
                  setPlaying(false);
                  seekTo(0);
                }}
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="h-8 w-8"
                onClick={() => seekTo(Math.min(totalDuration, playhead + 5))}
              >
                <SkipForward className="h-4 w-4" />
              </Button>
              <span className="ml-2 font-mono text-xs text-white/60">
                {formatTime(playhead)} / {formatTime(totalDuration)}
              </span>
            </div>

            {timeline.voiceTrack?.url ? (
              <audio ref={voiceRef} src={timeline.voiceTrack.url} preload="auto" className="hidden" />
            ) : null}
            {timeline.music?.url ? (
              <audio ref={musicRef} src={timeline.music.url} preload="auto" className="hidden" />
            ) : null}
          </div>
        </section>

        {/* Right properties + basic effects */}
        <aside className="flex min-h-0 flex-col border-l border-white/10 bg-[#1f1f1f]">
          <div className="border-b border-white/10 px-3 py-2 text-xs font-semibold">Properties window</div>
          <div className="space-y-3 overflow-y-auto border-b border-white/10 p-3 text-xs text-white/70">
            <p className="text-[10px] uppercase tracking-wide text-white/40">Project settings</p>
            <PropRow label="Title" value={project.title} />
            <PropRow label="Scene size" value={timeline.aspectRatio === "9:16" ? "1080×1920" : timeline.aspectRatio === "1:1" ? "1080×1080" : "1920×1080"} />
            <PropRow label="Frame rate" value="30 fps" />
            <PropRow label="Duration" value={formatTime(totalDuration)} />
            <PropRow label="Music" value={timeline.music?.name || "—"} />

            {selectedScene ? (
              <div className="space-y-2 border-t border-white/10 pt-3">
                <p className="text-[10px] uppercase tracking-wide text-white/40">Selected object</p>
                <PropRow label="Name" value={selectedScene.title} />
                <div className="space-y-1">
                  <Label className="text-[11px] text-white/55">
                    Duration ({selectedScene.durationSeconds.toFixed(1)}s)
                  </Label>
                  <input
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
                <div className="flex gap-1">
                  {(["image", "motion"] as VisualMode[]).map((mode) => (
                    <Button
                      key={mode}
                      type="button"
                      size="sm"
                      className="h-7 flex-1 text-[10px]"
                      variant={selectedScene.mode === mode ? "default" : "secondary"}
                      onClick={() => updateScene(selectedScene.id, { mode })}
                    >
                      {mode === "motion" ? "Motion" : "Still"}
                    </Button>
                  ))}
                </div>
                <select
                  value={selectedScene.assetId}
                  onChange={(event) => swapSceneAsset(selectedScene.id, event.target.value)}
                  className="w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-[11px]"
                >
                  {visualAssets
                    .filter((asset) => asset.url)
                    .map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.scene_title || `Scene ${asset.scene_index + 1}`}
                      </option>
                    ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 w-full text-[11px] text-red-300"
                  onClick={() => deleteScene(selectedScene.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </Button>
              </div>
            ) : (
              <p className="border-t border-white/10 pt-3 text-white/45">Select a clip on the timeline.</p>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
              <Wand2 className="h-3.5 w-3.5 text-forge" />
              Basic effects
            </div>
            <div className="space-y-3">
              <EffectSlider
                label="Brightness"
                value={effects.brightness}
                min={-100}
                max={100}
                onChange={(value) => setEffects({ brightness: value })}
              />
              <EffectSlider
                label="Contrast"
                value={effects.contrast}
                min={-100}
                max={100}
                onChange={(value) => setEffects({ contrast: value })}
              />
              <EffectSlider
                label="Gamma"
                value={effects.gamma}
                min={0.2}
                max={3}
                step={0.05}
                onChange={(value) => setEffects({ gamma: value })}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-7 w-full text-[11px]"
                onClick={() => setEffects({ ...DEFAULT_TIMELINE_EFFECTS })}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Reset effects
              </Button>
            </div>
          </div>
        </aside>
      </div>

      {/* Bottom multi-track timeline */}
      <div className="shrink-0 border-t border-white/10 bg-[#181818]">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-1 text-[10px] text-white/45">
          <span className="flex items-center gap-2">
            <FolderOpen className="h-3 w-3" />
            Timeline · Layers
          </span>
          <span className="font-mono">{formatTime(playhead)}</span>
        </div>

        <div className="overflow-x-auto p-2">
          <div className="min-w-[720px] space-y-1.5">
            {/* Ruler */}
            <div className="relative ml-20 h-5 border-b border-white/10">
              {Array.from({ length: Math.max(2, Math.ceil(totalDuration / 2) + 1) }).map((_, index) => {
                const t = index * 2;
                const left = (t / totalDuration) * 100;
                return (
                  <span
                    key={t}
                    className="absolute top-0 -translate-x-1/2 font-mono text-[9px] text-white/40"
                    style={{ left: `${left}%` }}
                  >
                    {formatTime(t)}
                  </span>
                );
              })}
              <button
                type="button"
                aria-label="Playhead"
                className="absolute top-0 z-10 h-full w-0.5 bg-forge"
                style={{ left: `${(playhead / totalDuration) * 100}%` }}
                onClick={() => undefined}
              />
            </div>

            <TrackRow
              label="Video"
              icon={<Film className="h-3 w-3 text-sky-400" />}
              onSeek={seekTo}
              totalDuration={totalDuration}
            >
              {readyScenes.map((scene) => {
                const widthPercent = (scene.durationSeconds / totalDuration) * 100;
                const leftPercent = (scene.startSeconds / totalDuration) * 100;
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
                    onClick={() => {
                      setSelectedSceneId(scene.id);
                      seekTo(scene.startSeconds);
                    }}
                    className={`absolute top-0.5 h-[calc(100%-4px)] overflow-hidden rounded border text-left ${
                      selectedSceneId === scene.id
                        ? "border-forge ring-1 ring-forge/50"
                        : "border-white/20 hover:border-white/40"
                    }`}
                    style={{ left: `${leftPercent}%`, width: `${Math.max(widthPercent, 2)}%` }}
                  >
                    {scene.url ? (
                      <Image src={scene.url} alt="" fill className="object-cover opacity-80" unoptimized />
                    ) : null}
                    <span className="absolute inset-x-1 bottom-0.5 truncate text-[9px] font-medium drop-shadow">
                      {scene.title}
                    </span>
                  </button>
                );
              })}
            </TrackRow>

            <TrackRow label="Voice" icon={<Mic2 className="h-3 w-3 text-emerald-400" />} totalDuration={totalDuration} onSeek={seekTo}>
              {timeline.voiceTrack?.url ? (
                <div className="absolute inset-y-0.5 left-0 right-0 rounded border border-emerald-500/40 bg-emerald-500/20 px-2 text-[10px] leading-7 text-emerald-100">
                  Narration · {voiceAsset?.voice_id || "voice"}
                </div>
              ) : null}
            </TrackRow>

            <TrackRow label="Music" icon={<Music2 className="h-3 w-3 text-amber-400" />} totalDuration={totalDuration} onSeek={seekTo}>
              {timeline.music?.url ? (
                <div className="absolute inset-y-0.5 left-0 right-0 rounded border border-amber-500/40 bg-amber-500/20 px-2 text-[10px] leading-7 text-amber-100">
                  {timeline.music.name} · {Math.round(timeline.music.volume * 100)}%
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center px-2 text-[10px] text-white/35">
                  No background music — use Audio effects
                </div>
              )}
            </TrackRow>

            <TrackRow label="Captions" icon={<Subtitles className="h-3 w-3 text-violet-300" />} totalDuration={totalDuration} onSeek={seekTo}>
              {timeline.captions?.words?.length ? (
                <div className="absolute inset-y-0.5 left-0 right-0 rounded border border-violet-500/30 bg-violet-500/15 px-2 text-[10px] leading-7 text-violet-100">
                  {timeline.captions.words.length} words · {timeline.captions.style.position}
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center px-2 text-[10px] text-white/35">
                  No captions
                </div>
              )}
            </TrackRow>
          </div>
        </div>
      </div>
    </div>
  );
}

function captionAtTime(words: Array<{ word: string; start: number; end: number }>, time: number) {
  const nearby = words.filter((word) => time >= word.start - 0.05 && time <= word.end + 0.35);
  if (nearby.length) return nearby.map((word) => word.word).join(" ");
  const upcoming = words.find((word) => word.start >= time);
  return upcoming?.word ?? words[0]?.word ?? "";
}

function ToolbarButton({
  active,
  label,
  hint,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  hint: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-[72px] flex-col items-center gap-0.5 rounded border px-2 py-1.5 ${
        active ? "border-forge/60 bg-forge/15" : "border-transparent hover:border-white/15 hover:bg-white/5"
      }`}
    >
      {icon}
      <span className="text-[10px] font-medium leading-tight">{label}</span>
      <span className="text-[9px] text-white/40">{hint}</span>
    </button>
  );
}

function TreeButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-white/5 ${
        active ? "bg-white/10 text-white" : "text-white/70"
      }`}
    >
      <span className="text-white/35">▾</span>
      {label}
    </button>
  );
}

function PropRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-white/40">{label}</span>
      <span className="max-w-[55%] truncate text-right text-white/85">{value}</span>
    </div>
  );
}

function EffectSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] text-white/55">
        <span>{label}</span>
        <span>{step < 1 ? value.toFixed(2) : Math.round(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-forge"
      />
    </div>
  );
}

function TrackRow({
  label,
  icon,
  children,
  totalDuration,
  onSeek,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  totalDuration: number;
  onSeek: (time: number) => void;
}) {
  return (
    <div className="flex h-9 items-stretch gap-2">
      <div className="flex w-20 shrink-0 items-center gap-1.5 text-[10px] text-white/55">
        {icon}
        {label}
      </div>
      <div
        className="relative flex-1 rounded bg-black/40"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          onSeek(ratio * totalDuration);
        }}
      >
        {children}
      </div>
    </div>
  );
}
