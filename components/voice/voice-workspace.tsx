"use client";

import { ModuleLink } from "@/components/dashboard/module-nav";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Film, Loader2, Mic2, Pause, Play, Sparkles, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ModuleHeader } from "@/components/dashboard/module-header";
import { WorkspaceNotice } from "@/components/dashboard/workspace-notice";
import { JobProgressCard } from "@/components/dashboard/job-progress-card";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useWorkspaceProject } from "@/hooks/use-workspace-project";
import type { Project } from "@/lib/types/project";
import type { VoiceAsset, VoiceJobPollResponse, VoiceOption } from "@/lib/types/voice";
import { formatVideoDuration } from "@/lib/video-gen";

function formatDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return "0:00";
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function WaveformBars({ playing }: { playing: boolean }) {
  return (
    <div className="flex h-16 items-end gap-1">
      {Array.from({ length: 28 }).map((_, index) => (
        <span
          key={index}
          className={`w-1 rounded-full bg-forge/80 ${playing ? "animate-pulse" : "opacity-70"}`}
          style={{ height: `${30 + ((index * 17) % 55)}%`, animationDelay: `${index * 40}ms` }}
        />
      ))}
    </div>
  );
}

export function VoiceWorkspace({ initialProject }: { initialProject: Project | null }) {
  const { project, setProject, activeProjectId } = useWorkspaceProject(initialProject);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceId, setVoiceId] = useState("en-US-JennyNeural");
  const [voiceAsset, setVoiceAsset] = useState<VoiceAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [job, setJob] = useState<VoiceJobPollResponse | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoVoiceRef = useRef<HTMLAudioElement | null>(null);

  const scriptPreview = useMemo(() => {
    const text = project?.script?.trim();
    if (!text) return "";
    return text.length > 320 ? `${text.slice(0, 320)}…` : text;
  }, [project?.script]);

  const captionCount = voiceAsset?.word_timestamps_json?.length ?? 0;

  const loadVoice = useCallback(async (projectId: string) => {
    const response = await fetch(`/api/projects/${projectId}/voice`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load voice data.");
    setProject(data.project);
    setVoiceAsset(data.voiceAsset ?? null);
    if (data.voiceAsset?.voice_id) {
      const saved = String(data.voiceAsset.voice_id);
      setVoiceId(saved.includes("Neural") ? saved : "en-US-JennyNeural");
    }
  }, [setProject]);

  useEffect(() => {
    fetch("/api/voices")
      .then((response) => response.json())
      .then((data) => setVoices(data.voices ?? []))
      .catch(() => setNotice("Could not load voice catalog."));
  }, []);

  useEffect(() => {
    if (project?.id) {
      loadVoice(project.id).catch((error) => {
        setNotice(error instanceof Error ? error.message : "Could not load voice data.");
      });
    }
  }, [project?.id, activeProjectId, loadVoice]);

  const pollJob = useCallback(async (jobId: string) => {
    const response = await fetch(`/api/jobs/${jobId}`);
    const data = (await response.json()) as VoiceJobPollResponse & { error?: string };
    if (!response.ok) throw new Error(data.error || "Job polling failed.");
    setJob(data);
    if (data.voiceAsset) setVoiceAsset(data.voiceAsset);
    return data;
  }, []);

  useEffect(() => {
    if (!job?.id || job.status === "completed" || job.status === "failed") return;

    let cancelled = false;
    let inFlight = false;
    let pollErrors = 0;

    const tick = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const latest = await pollJob(job.id);
        if (cancelled) return;
        pollErrors = 0;
        if (latest.status === "completed") {
          setBusy(false);
          setNotice(latest.message || "Voiceover ready.");
          if (project?.id) await loadVoice(project.id);
        }
        if (latest.status === "failed") {
          setBusy(false);
          setNotice(latest.error || "Voice generation failed.");
        }
      } catch (error) {
        if (cancelled) return;
        pollErrors += 1;
        // Transient network blips during long TTS — keep polling a few times.
        if (pollErrors >= 5) {
          setBusy(false);
          setNotice(error instanceof Error ? error.message : "Job polling failed.");
        }
      } finally {
        inFlight = false;
      }
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [job?.id, job?.status, pollJob, project?.id, loadVoice]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [voiceAsset?.audio_url]);

  useEffect(() => {
    const video = videoRef.current;
    const voice = videoVoiceRef.current;
    if (!video || !voice) return;

    const sync = () => {
      if (Math.abs(voice.currentTime - video.currentTime) > 0.35) {
        voice.currentTime = video.currentTime;
      }
    };
    const onPlay = () => {
      sync();
      void voice.play();
    };
    const onPause = () => voice.pause();
    const onSeek = () => {
      voice.currentTime = video.currentTime;
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeking", onSeek);
    video.addEventListener("timeupdate", sync);
    video.addEventListener("ended", onPause);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeking", onSeek);
      video.removeEventListener("timeupdate", sync);
      video.removeEventListener("ended", onPause);
    };
  }, [voiceAsset?.audio_url, project?.visual_video_url]);

  async function generateVoiceover() {
    if (!project?.id) return;
    const selected = voices.find((voice) => voice.id === voiceId);
    if (selected?.comingSoon) {
      setNotice(`${selected.label} is coming soon. Pick an English narrator for now.`);
      return;
    }
    setBusy(true);
    setNotice(null);
    setPlaying(false);
    setJob({
      id: "",
      status: "running",
      progress: 5,
      message: "Starting voice generation…",
      error: null,
      projectId: project.id,
    });

    try {
      const response = await fetch(`/api/projects/${project.id}/voice/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not start voice generation.");

      const first: VoiceJobPollResponse = {
        id: data.jobId || data.id || "",
        status: data.status || "running",
        progress: data.progress ?? 10,
        message: data.message || "Synthesizing narration…",
        error: data.error ?? null,
        projectId: project.id,
        voiceAsset: data.voiceAsset,
      };
      setJob(first);

      if (first.status === "completed" || data.audioUrl) {
        setBusy(false);
        setNotice(first.message || "Voiceover ready.");
        await loadVoice(project.id);
        return;
      }

      if (first.status === "failed") {
        setBusy(false);
        setNotice(first.error || "Voice generation failed.");
        return;
      }

      // Keep busy=true; the poll interval advances remaining chunks.
    } catch (error) {
      setBusy(false);
      setJob(null);
      setNotice(error instanceof Error ? error.message : "Could not generate voiceover.");
    }
  }

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }

  if (!project?.script?.trim()) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <ModuleHeader
          step="Module 03 · Voice"
          title="Give your script a voice"
          description="Generate neural narration with word-level caption timing for Edit and Export."
        />
        <Card className="border-dashed border-forge/20">
          <CardHeader>
            <CardTitle>Script required</CardTitle>
            <CardDescription>Complete Module 1 first — voice generation reads from your project script.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <ModuleLink href="/dashboard/script">Go to Script</ModuleLink>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <ModuleHeader
          step="Module 03 · Voice"
          title="Give your script a voice"
          description="Windows voices synthesize natural narration, chunk long scripts automatically, and store word timings for captions."
        />
        <Button onClick={generateVoiceover} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Generate voiceover
        </Button>
      </div>

      {notice ? (
        <WorkspaceNotice
          message={notice}
          variant={
            notice.toLowerCase().includes("fail") || notice.toLowerCase().includes("error")
              ? "error"
              : notice.toLowerCase().includes("ready")
                ? "success"
                : "info"
          }
        />
      ) : null}

      {busy ? (
        <JobProgressCard
          message={job?.message || "Generating voiceover…"}
          progress={job?.progress ?? 8}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {project.visual_video_url ? (
          <Card className="border-forge/20 bg-card/60 lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Film className="h-5 w-5 text-forge" />
                Visual video from Module 02
              </CardTitle>
              <CardDescription>
                {voiceAsset?.audio_url
                  ? "Play the video to hear the generated narration on top of your visuals."
                  : `Your silent AI video (${formatVideoDuration(project.visual_video_duration_seconds)}). Generate voiceover to hear narration in this player.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="aspect-video max-w-3xl overflow-hidden rounded-lg bg-black">
                <video
                  ref={videoRef}
                  src={project.visual_video_url}
                  className="h-full w-full object-contain"
                  controls
                  playsInline
                  preload="metadata"
                />
                {voiceAsset?.audio_url ? (
                  <audio ref={videoVoiceRef} src={voiceAsset.audio_url} preload="auto" className="hidden" />
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed border-white/15 lg:col-span-2">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-6">
              <p className="text-sm text-muted-foreground">
                No visual video yet — generate script-matched visuals in Module 02 first.
              </p>
              <Button asChild variant="outline" size="sm">
                <ModuleLink href="/dashboard/visuals">Go to Visuals →</ModuleLink>
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Volume2 className="h-5 w-5 text-forge" />
              Preview
            </CardTitle>
            <CardDescription>
              {voiceAsset?.audio_url
                ? "Play the generated voiceover and verify pacing before moving to Thumbnail."
                : "Generate a voiceover to unlock the audio preview."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-black/30 p-5">
              <WaveformBars playing={playing} />
              <div className="mt-4 flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  disabled={!voiceAsset?.audio_url}
                  onClick={togglePlayback}
                >
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <div className="text-sm text-muted-foreground">
                  Duration <span className="text-foreground">{formatDuration(voiceAsset?.duration_seconds)}</span>
                </div>
                {voiceAsset?.audio_url ? (
                  <audio ref={audioRef} src={voiceAsset.audio_url} preload="metadata" className="hidden" />
                ) : null}
              </div>
            </div>

            {voiceAsset?.audio_url ? (
              <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide">Voice</p>
                  <p className="text-foreground">{voiceAsset.voice_id}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide">Caption words</p>
                  <p className="text-foreground">{captionCount.toLocaleString()}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide">Provider</p>
                  <p className="text-foreground">Edge TTS · Windows fallback</p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mic2 className="h-5 w-5 text-forge" />
              Narrator
            </CardTitle>
            <CardDescription>Pick a narrator. Generate to hear it on the video above.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="voice-select">Voice</Label>
              <Select
                id="voice-select"
                value={voiceId}
                onChange={(event) => setVoiceId(event.target.value)}
                disabled={busy}
              >
                {voices.map((voice) => (
                  <option key={voice.id} value={voice.id} disabled={voice.comingSoon}>
                    {voice.label} · {voice.locale}
                    {voice.comingSoon ? " · Coming soon" : ""}
                  </option>
                ))}
              </Select>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Script excerpt</p>
              <p className="mt-2 text-sm leading-relaxed text-foreground/90">{scriptPreview}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
