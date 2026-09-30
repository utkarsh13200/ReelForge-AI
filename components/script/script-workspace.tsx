"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, Youtube, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DURATION_OPTIONS, TONE_OPTIONS, type Project } from "@/lib/types/project";
import { countWords } from "@/lib/script/utils";
import { ModuleHeader } from "@/components/dashboard/module-header";
import { WorkspaceNotice } from "@/components/dashboard/workspace-notice";
import { JobProgressCard } from "@/components/dashboard/job-progress-card";
import { Select } from "@/components/ui/select";
import { useWorkspaceProject } from "@/hooks/use-workspace-project";
import { useModuleNav } from "@/components/dashboard/module-nav";
import { useProject } from "@/components/dashboard/project-provider";
import { apiFetch } from "@/lib/api/client";

type JobPoll = {
  id: string;
  status: string;
  progress: number;
  message: string;
  error: string | null;
  script: string | null;
  projectId: string;
};

export function ScriptWorkspace({ initialProject }: { initialProject: Project | null }) {
  const { project, setProject, activeProjectId } = useWorkspaceProject(initialProject);
  const { goTo } = useModuleNav();
  const { setScriptForVisuals } = useProject();
  const [topic, setTopic] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [tone, setTone] = useState("educational");
  const [customTone, setCustomTone] = useState("");
  const [duration, setDuration] = useState("1");
  const [modifyTranscript, setModifyTranscript] = useState(true);
  const [modifyInstructions, setModifyInstructions] = useState(
    "Rewrite this transcript into a polished YouTube narration script. Fix punctuation, remove filler words, and break into paragraphs."
  );
  const [script, setScript] = useState(initialProject?.script ?? "");

  useEffect(() => {
    setScript(project?.script ?? "");
  }, [activeProjectId, project?.script]);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [job, setJob] = useState<JobPoll | null>(null);

  const wordCount = useMemo(() => countWords(script), [script]);
  const targetWords = DURATION_OPTIONS.find((option) => option.value === duration)?.targetWords ?? 150;
  const durationLabel = DURATION_OPTIONS.find((option) => option.value === duration)?.label ?? "1 min";

  const ensureProject = useCallback(async () => {
    if (project?.id) return project;
    const data = await apiFetch<{ project: Project }>("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: topic.trim() || "Untitled project", source_type: "topic" }),
    });
    setProject(data.project);
    return data.project;
  }, [project, topic, setProject]);

  const pollJob = useCallback(async (jobId: string) => {
    const data = await apiFetch<JobPoll>(`/api/jobs/${jobId}`);
    setJob(data);
    if (data.script) setScript(data.script);
    return data;
  }, []);

  useEffect(() => {
    if (!job?.id || job.status === "completed" || job.status === "failed") return;

    const timer = window.setInterval(async () => {
      try {
        const latest = await pollJob(job.id);
        if (latest.status === "completed") {
          setBusy(false);
          setNotice("Script ready — continue to Visuals when you're happy with it.");
          const projectData = await apiFetch<{ project: Project }>(`/api/projects/${latest.projectId}`);
          setProject(projectData.project);
          if (projectData.project.script?.trim()) {
            setScript(projectData.project.script);
          } else if (latest.script?.trim()) {
            setScript(latest.script);
          }
        }
        if (latest.status === "failed") {
          setBusy(false);
          setNotice(latest.error || "Generation failed.");
        }
      } catch (error) {
        setBusy(false);
        setNotice(error instanceof Error ? error.message : "Job polling failed.");
      }
    }, 2000);

    return () => window.clearInterval(timer);
  }, [job, pollJob, setProject, goTo]);

  async function continueToVisuals() {
    const text = script.trim();
    if (!text) {
      setNotice("Generate or write a script first.");
      return;
    }
    setNotice(null);
    try {
      let active = project;
      if (project?.id) {
        const data = await apiFetch<{ project: Project }>(`/api/projects/${project.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script: text }),
        });
        active = data.project;
        setProject(active);
      } else {
        active = await ensureProject();
        const data = await apiFetch<{ project: Project }>(`/api/projects/${active.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script: text }),
        });
        active = data.project;
        setProject(active);
      }
      setScriptForVisuals(text);
      goTo("/dashboard/visuals");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save script.");
    }
  }

  async function startTopicGeneration() {
    if (!topic.trim()) {
      setNotice("Enter a topic first.");
      return;
    }
    if (tone === "others" && !customTone.trim()) {
      setNotice("Describe your custom tone/style.");
      return;
    }
    setBusy(true);
    setNotice(null);
    setJob(null);
    try {
      const active = await ensureProject();
      const data = await apiFetch<{ jobId: string }>(`/api/projects/${active.id}/script/topic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, tone, customTone: tone === "others" ? customTone : undefined, duration }),
      });
      const first = await pollJob(data.jobId);
      setJob(first);
      if (first.status === "failed") {
        setBusy(false);
        setNotice(first.error || "Generation failed.");
      }
      if (first.status === "completed") {
        setBusy(false);
        setNotice("Script ready — continue to Visuals when you're happy with it.");
        const projectData = await apiFetch<{ project: Project }>(`/api/projects/${active.id}`);
        setProject(projectData.project);
        const savedScript = projectData.project.script?.trim() || first.script?.trim() || "";
        if (savedScript) setScript(savedScript);
      }
    } catch (error) {
      setBusy(false);
      setNotice(error instanceof Error ? error.message : "Could not generate script.");
    }
  }

  async function startYoutubeImport() {
    if (!youtubeUrl.trim()) {
      setNotice("Paste a YouTube URL first.");
      return;
    }
    setBusy(true);
    setNotice(null);
    setJob(null);
    try {
      const active = await ensureProject();
      const data = await apiFetch<{ jobId: string }>(`/api/projects/${active.id}/script/youtube`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: youtubeUrl,
          modifyTranscript,
          modifyInstructions: modifyTranscript ? modifyInstructions : undefined,
        }),
      });
      const first = await pollJob(data.jobId);
      setJob(first);
      if (first.status === "failed") {
        setBusy(false);
        setNotice(first.error || "Import failed.");
      }
      if (first.status === "completed") {
        setBusy(false);
        setNotice(modifyTranscript ? "Transcript imported and modified." : "Raw transcript imported.");
      }
    } catch (error) {
      setBusy(false);
      setNotice(error instanceof Error ? error.message : "Could not import transcript.");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <ModuleHeader
        step="Module 01 · Script"
        title="Write your narration"
        description="Generate a long-form script from a topic or import a YouTube transcript."
      />

      <Tabs defaultValue="topic" className="space-y-4">
        <TabsList>
          <TabsTrigger value="topic">Topic → Script</TabsTrigger>
          <TabsTrigger value="youtube">YouTube URL → Script</TabsTrigger>
        </TabsList>

        <TabsContent value="topic">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Write from a topic</CardTitle>
              <CardDescription>
                AI writes a {durationLabel} script (~{targetWords.toLocaleString()} words) in sections — progress shows live below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="topic">Topic</Label>
                <Input
                  id="topic"
                  placeholder="Why creators burn out before their best work"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tone">Tone / style</Label>
                  <Select
                    id="tone"
                    value={tone}
                    onChange={(event) => setTone(event.target.value)}
                    disabled={busy}
                  >
                    {TONE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration">Target length</Label>
                  <Select
                    id="duration"
                    value={duration}
                    onChange={(event) => setDuration(event.target.value)}
                    disabled={busy}
                  >
                    {DURATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              {tone === "others" ? (
                <div className="space-y-2">
                  <Label htmlFor="custom-tone">Describe your tone / style</Label>
                  <Input
                    id="custom-tone"
                    placeholder="e.g. motivational, sarcastic, cinematic documentary"
                    value={customTone}
                    onChange={(event) => setCustomTone(event.target.value)}
                    disabled={busy}
                  />
                </div>
              ) : null}
              <Button onClick={startTopicGeneration} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate script
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="youtube">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Import from YouTube</CardTitle>
              <CardDescription>
                Fetches captions from the video. Turn on modify to rewrite the transcript with AI.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="youtube-url">YouTube URL</Label>
                <Input
                  id="youtube-url"
                  placeholder="https://www.youtube.com/watch?v=…"
                  value={youtubeUrl}
                  onChange={(event) => setYoutubeUrl(event.target.value)}
                  disabled={busy}
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={modifyTranscript}
                  onChange={(event) => setModifyTranscript(event.target.checked)}
                  disabled={busy}
                  className="rounded border-white/20"
                />
                Modify transcript with AI
              </label>
              {modifyTranscript ? (
                <div className="space-y-2">
                  <Label htmlFor="modify-instructions">Modification instructions</Label>
                  <Textarea
                    id="modify-instructions"
                    className="min-h-[100px]"
                    value={modifyInstructions}
                    onChange={(event) => setModifyInstructions(event.target.value)}
                    disabled={busy}
                    placeholder="How should the transcript be rewritten?"
                  />
                </div>
              ) : null}
              <Button onClick={startYoutubeImport} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Youtube className="h-4 w-4" />}
                {modifyTranscript ? "Import & modify transcript" : "Import raw transcript"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {job && busy ? <JobProgressCard message={job.message} progress={job.progress} /> : null}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-xl">Your script</CardTitle>
            <CardDescription>
              {wordCount.toLocaleString()} words — saved automatically when you continue to Visuals.
            </CardDescription>
          </div>
          <Button onClick={continueToVisuals} disabled={!script.trim() || busy} className="shrink-0 gap-1">
            Next: Visuals
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <Textarea
            value={script}
            onChange={(event) => setScript(event.target.value)}
            placeholder="Generated script will appear here. You can edit it before moving to Visuals."
          />
        </CardContent>
      </Card>

      {notice ? (
        <WorkspaceNotice
          message={notice}
          variant={
            notice.toLowerCase().includes("fail") ||
            notice.toLowerCase().includes("not configured") ||
            notice.toLowerCase().includes("required") ||
            notice.toLowerCase().includes("valid")
              ? "error"
              : notice.toLowerCase().includes("saved") || notice.toLowerCase().includes("imported")
                ? "success"
                : "info"
          }
        />
      ) : null}
    </div>
  );
}
