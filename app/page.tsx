"use client";

import { useMemo, useState } from "react";
import { initialComplianceIssues, type ComplianceIssue } from "../lib/compliance";

type Stage = "Script" | "Visuals" | "Voice" | "Thumbnail" | "Review" | "Export";
type IconName = "grid" | "sparkle" | "folder" | "library" | "settings" | "arrow" | "play" | "wand" | "check" | "chevron" | "audio" | "download" | "dots" | "clock" | "warning" | "close" | "plus" | "pause";

const stages: { name: Stage; description: string }[] = [
  { name: "Script", description: "The creative foundation" },
  { name: "Visuals", description: "Scene-by-scene direction" },
  { name: "Voice", description: "Narration & language" },
  { name: "Thumbnail", description: "The click moment" },
  { name: "Review", description: "A thoughtful final pass" },
  { name: "Export", description: "Ready for your channel" },
];

const scenes = [
  { number: "01", duration: "00:00 – 00:28", title: "Open with an unexpected shift", prompt: "Cinematic wide shot of a lone creator at sunrise, warm light spilling over a city studio, 35mm film, quiet confidence", tone: "amber" },
  { number: "02", duration: "00:28 – 01:05", title: "Name the real problem", prompt: "Close-up of hands sorting creative notes, editorial desk, muted indigo shadows, analog textures", tone: "violet" },
  { number: "03", duration: "01:05 – 01:42", title: "Show the breakthrough", prompt: "Futuristic glass dashboard blooming with ideas, soft electric blue glow, clean editorial composition", tone: "blue" },
  { number: "04", duration: "01:42 – 02:10", title: "Invite the next step", prompt: "A bright doorway leading from a dark studio toward a vivid landscape, optimistic cinematic frame", tone: "coral" },
];

const scriptDefault = `Every creator knows the feeling: you have an idea that could change everything, but turning it into a finished video means opening ten different tabs before breakfast.\n\nWhat if the entire creative process felt like one clear, focused story? Today, we are building a calmer way to make the work — from the first spark to the final frame.\n\nStart with the truth your audience needs to hear. Then give that truth a shape, a voice, and a visual world they will want to stay inside.`;

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const base = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<IconName, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    sparkle: <><path d="m12 3-1.6 5.4L5 10l5.4 1.6L12 17l1.6-5.4L19 10l-5.4-1.6L12 3Z"/><path d="m19 16-.6 2.4L16 19l2.4.6L19 22l.6-2.4L22 19l-2.4-.6L19 16Z"/></>,
    folder: <><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h4l2 2h7A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11Z"/></>,
    library: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z"/><path d="M4 19a2.5 2.5 0 0 1 2.5-2.5H20"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.04 2.04-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.02 1.55v.09h-2.88v-.09A1.7 1.7 0 0 0 10.9 18.6a1.7 1.7 0 0 0-1.88.34l-.06.06-2.04-2.04.06-.06A1.7 1.7 0 0 0 7.32 15 1.7 1.7 0 0 0 5.77 14H5.7v-2.88h.09A1.7 1.7 0 0 0 7.32 10.1a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.04-2.04.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.02-1.55v-.09h2.88v.09a1.7 1.7 0 0 0 1.02 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.04 2.04-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1.02h.09V14h-.09A1.7 1.7 0 0 0 19.4 15Z"/></>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    play: <path d="m9 6 9 6-9 6V6Z" fill="currentColor" stroke="none"/>,
    wand: <><path d="m4 20 12-12"/><path d="m14 4 1-2 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z"/><path d="m19 14 .7-1.3L21 12l-1.3-.7L19 10l-.7 1.3L17 12l1.3.7L19 14Z"/></>,
    check: <path d="m5 12 4.2 4L19 6.5"/>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    audio: <><path d="M4 14h3l3 4V6L7 10H4v4Z"/><path d="M14 9a4 4 0 0 1 0 6"/><path d="M17 6a8 8 0 0 1 0 12"/></>,
    download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 20h16"/></>,
    dots: <><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.4 2"/></>,
    warning: <><path d="m12 3 9 16H3l9-16Z"/><path d="M12 9v4"/><path d="M12 16h.01"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    pause: <><path d="M8 6v12M16 6v12"/></>,
  };
  return <svg {...base}>{paths[name]}</svg>;
}

function Avatar({ small = false }: { small?: boolean }) {
  return <div className={`avatar ${small ? "avatar-small" : ""}`}><span>AM</span></div>;
}

export default function CreatorStudio() {
  const [activeStage, setActiveStage] = useState<Stage>("Visuals");
  const [activeScene, setActiveScene] = useState(0);
  const [script, setScript] = useState(scriptDefault);
  const [scenePrompt, setScenePrompt] = useState(scenes[0].prompt);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sceneMode, setSceneMode] = useState<"Image" | "Motion">("Image");
  const [language, setLanguage] = useState("English (US)");
  const [voice, setVoice] = useState("Maya · Warm storyteller");
  const [issues, setIssues] = useState<ComplianceIssue[]>(initialComplianceIssues);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [selectedThumb, setSelectedThumb] = useState(0);
  const [projectName, setProjectName] = useState("The calm creator’s advantage");

  const currentScene = scenes[activeScene];
  const stageIndex = stages.findIndex((stage) => stage.name === activeStage);
  const estimatedCost = useMemo(() => (6.48 + activeScene * 0.84 + (sceneMode === "Motion" ? 2.2 : 0)).toFixed(2), [activeScene, sceneMode]);

  function generateVisual() {
    setIsGenerating(true);
    window.setTimeout(() => setIsGenerating(false), 1050);
  }

  function selectScene(index: number) {
    setActiveScene(index);
    setScenePrompt(scenes[index].prompt);
  }

  function applyFix(issue: ComplianceIssue) {
    setIssues((all) => all.filter((item) => item.id !== issue.id));
  }

  function startExport() {
    setExporting(true);
    setExportProgress(13);
    const timer = window.setInterval(() => {
      setExportProgress((current) => {
        if (current >= 100) {
          window.clearInterval(timer);
          return 100;
        }
        return Math.min(100, current + (current < 82 ? 17 : 9));
      });
    }, 480);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><i></i><i></i><i></i></span><span>Creator&apos;s Bible</span></div>
        <button className="new-project"><Icon name="plus" size={16}/> New project</button>
        <nav className="primary-nav" aria-label="Main navigation">
          <button className="nav-link active"><Icon name="grid"/>Overview</button>
          <button className="nav-link"><Icon name="folder"/>My projects</button>
          <button className="nav-link"><Icon name="library"/>Asset library</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="credit-card">
            <div className="credit-row"><span>Creative credit</span><strong>72%</strong></div>
            <div className="credit-bar"><i></i></div>
            <p>180 of 250 credits remaining</p>
            <button>View plan <Icon name="arrow" size={14}/></button>
          </div>
          <button className="nav-link"><Icon name="settings"/>Settings</button>
          <button className="profile-row"><Avatar small/><span><b>Alex Morgan</b><em>Studio plan</em></span><Icon name="dots" size={18}/></button>
        </div>
      </aside>

      <section className="content-area">
        <header className="topbar">
          <div className="crumbs"><button>Projects</button><Icon name="chevron" size={14}/><input value={projectName} onChange={(event) => setProjectName(event.target.value)} aria-label="Project title"/></div>
          <div className="top-actions"><button className="icon-button" aria-label="Notifications"><span className="notification-dot"></span><Icon name="sparkle" size={18}/></button><Avatar/><button className="avatar-chevron"><Icon name="chevron" size={14}/></button></div>
        </header>

        <div className="studio-header">
          <div><p className="eyebrow">ORIGINAL IDEA · LONG-FORM VIDEO</p><h1>{projectName}</h1><p className="subcopy">A focused workflow for shaping your idea into something unforgettable.</p></div>
          <div className="header-status"><span className="status-dot"></span><span>All changes saved</span><button className="more-button"><Icon name="dots"/></button></div>
        </div>

        <section className="stage-rail" aria-label="Production stages">
          {stages.map((stage, index) => (
            <button key={stage.name} className={`stage-item ${activeStage === stage.name ? "selected" : ""} ${index < stageIndex ? "complete" : ""}`} onClick={() => setActiveStage(stage.name)}>
              <span className="stage-number">{index < stageIndex ? <Icon name="check" size={13}/> : `0${index + 1}`}</span>
              <span><b>{stage.name}</b><em>{stage.description}</em></span>
            </button>
          ))}
        </section>

        <div className="workspace">
          <section className="main-panel">
            {activeStage === "Script" && <ScriptStage script={script} setScript={setScript} onContinue={() => setActiveStage("Visuals")}/>} 
            {activeStage === "Visuals" && <VisualStage activeScene={activeScene} currentScene={currentScene} prompt={scenePrompt} setPrompt={setScenePrompt} mode={sceneMode} setMode={setSceneMode} generating={isGenerating} onGenerate={generateVisual} onContinue={() => setActiveStage("Voice")}/>} 
            {activeStage === "Voice" && <VoiceStage language={language} setLanguage={setLanguage} voice={voice} setVoice={setVoice} onContinue={() => setActiveStage("Thumbnail")}/>} 
            {activeStage === "Thumbnail" && <ThumbnailStage selected={selectedThumb} setSelected={setSelectedThumb} onContinue={() => setActiveStage("Review")}/>} 
            {activeStage === "Review" && <ReviewStage issues={issues} onApply={applyFix} onContinue={() => setActiveStage("Export")}/>} 
            {activeStage === "Export" && <ExportStage projectName={projectName} exporting={exporting} progress={exportProgress} onExport={startExport}/>} 
          </section>

          <aside className="right-panel">
            {activeStage === "Visuals" ? <ScenesPanel active={activeScene} onSelect={selectScene}/> : <ProjectSnapshot activeStage={activeStage} cost={estimatedCost} issues={issues.length}/>} 
          </aside>
        </div>
      </section>
    </main>
  );
}

function StageTitle({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: React.ReactNode }) {
  return <div className="stage-title"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{copy}</p></div>{action}</div>;
}

function ScriptStage({ script, setScript, onContinue }: { script: string; setScript: (value: string) => void; onContinue: () => void }) {
  const [generating, setGenerating] = useState(false);
  return <div className="stage-content">
    <StageTitle eyebrow="01 · SCRIPT" title="Give the idea a heartbeat." copy="Edit every word before it moves into production." action={<button className="ghost-button" onClick={() => { setGenerating(true); window.setTimeout(() => setGenerating(false), 850); }}><Icon name="wand" size={16}/>{generating ? "Shaping draft…" : "Refine with AI"}</button>}/>
    <div className="script-metadata"><span><b>Storytelling</b><em>Tone</em></span><span><b>8–10 min</b><em>Length</em></span><span><b>English</b><em>Language</em></span><span className="version-pill"><Icon name="clock" size={14}/>Version 3</span></div>
    <textarea className="script-editor" value={script} onChange={(event) => setScript(event.target.value)} aria-label="Script editor"/>
    <div className="editor-footer"><span>{script.trim().split(/\s+/).length} words · Approx. 1:08 spoken</span><button className="primary-button" onClick={onContinue}>Lock script & continue <Icon name="arrow" size={16}/></button></div>
  </div>;
}

function VisualStage({ activeScene, currentScene, prompt, setPrompt, mode, setMode, generating, onGenerate, onContinue }: { activeScene: number; currentScene: typeof scenes[number]; prompt: string; setPrompt: (value: string) => void; mode: "Image" | "Motion"; setMode: (value: "Image" | "Motion") => void; generating: boolean; onGenerate: () => void; onContinue: () => void }) {
  return <div className="stage-content visuals-stage">
    <StageTitle eyebrow="02 · VISUALS" title="Build a world, scene by scene." copy="Each visual is generated from your script, but the direction is entirely yours." action={<span className="autosave"><span></span> Live editing</span>}/>
    <div className="scene-focus"><span>SCENE {currentScene.number}</span><b>{currentScene.title}</b><em>{currentScene.duration}</em></div>
    <div className={`visual-canvas ${currentScene.tone} ${generating ? "generating" : ""}`}>
      <div className="canvas-grid"></div><div className="orb orb-one"></div><div className="orb orb-two"></div><div className="canvas-caption"><span>{mode === "Image" ? "STILL VISUAL" : "MOTION CLIP"}</span><p>{generating ? "Composing a new take…" : "A visual pause before the idea takes flight."}</p></div>
      {generating && <div className="generation-loader"><span></span><span></span><span></span></div>}
      <button className="play-preview" aria-label="Preview scene"><Icon name="play" size={18}/></button>
      <div className="canvas-duration"><Icon name="clock" size={14}/> {activeScene === 0 ? "00:28" : "00:37"}</div>
    </div>
    <div className="visual-controls"><div className="mode-switch"><button className={mode === "Image" ? "picked" : ""} onClick={() => setMode("Image")}>Image</button><button className={mode === "Motion" ? "picked" : ""} onClick={() => setMode("Motion")}>Motion</button></div><button className="outline-button" onClick={onGenerate}><Icon name="wand" size={16}/>{generating ? "Generating" : "Regenerate"}</button></div>
    <label className="prompt-label">Creative direction <span>Auto-generated from your script</span><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
    <div className="stage-footer"><button className="text-button">Save as draft</button><button className="primary-button" onClick={onContinue}>Continue to voice <Icon name="arrow" size={16}/></button></div>
  </div>;
}

function VoiceStage({ language, setLanguage, voice, setVoice, onContinue }: { language: string; setLanguage: (value: string) => void; voice: string; setVoice: (value: string) => void; onContinue: () => void }) {
  const [playing, setPlaying] = useState(false);
  return <div className="stage-content">
    <StageTitle eyebrow="03 · VOICEOVER" title="Let your story be heard." copy="Generate natural narration, then export the same story in any language." />
    <div className="voice-grid"><div className="voice-card selected-voice"><div className="voice-art"><span className="sound-wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><button onClick={() => setPlaying(!playing)}>{playing ? <Icon name="pause"/> : <Icon name="play"/>}</button></div><div className="voice-info"><p>Primary narration</p><h3>{voice.split(" · ")[0]}</h3><span>Warm · Conversational · Clear</span><div className="timeline"><i></i></div><small>00:00 <b> · </b> 01:08</small></div></div><div className="voice-settings"><label>Language<select value={language} onChange={(event) => setLanguage(event.target.value)}><option>English (US)</option><option>Hindi</option><option>Spanish</option><option>Portuguese</option><option>French</option><option>Arabic</option></select></label><label>Voice<select value={voice} onChange={(event) => setVoice(event.target.value)}><option>Maya · Warm storyteller</option><option>James · Documentary</option><option>Aarav · Calm authority</option><option>Sofia · Bright & direct</option></select></label><button className="outline-button"><Icon name="audio" size={16}/>Preview voice</button></div></div>
    <div className="language-note"><span className="language-icon">A</span><div><b>Tell this story in more places</b><p>Create dubbed versions without rebuilding the project. Your originals stay credited to you.</p></div><button>+ Add language</button></div>
    <div className="stage-footer"><span className="cost-note">Est. 8 credits for this voiceover</span><button className="primary-button" onClick={onContinue}>Continue to thumbnail <Icon name="arrow" size={16}/></button></div>
  </div>;
}

function ThumbnailStage({ selected, setSelected, onContinue }: { selected: number; setSelected: (value: number) => void; onContinue: () => void }) {
  const labels = ["Curiosity", "Quiet confidence", "Big promise"];
  return <div className="stage-content">
    <StageTitle eyebrow="04 · THUMBNAIL" title="Make the pause worth the click." copy="Three creative angles, each designed around a different emotional hook." action={<button className="ghost-button"><Icon name="wand" size={16}/>Generate more</button>}/>
    <div className="thumbnail-grid">{labels.map((label, index) => <button key={label} className={`thumbnail-card thumb-${index} ${selected === index ? "chosen" : ""}`} onClick={() => setSelected(index)}><span className="thumb-label">{label}</span><div className="thumb-composition"><i></i><i></i><b>{index === 0 ? "MAKE MORE\nWITH LESS" : index === 1 ? "THE CALM\nADVANTAGE" : "CREATE\nYOUR WAY"}</b></div>{selected === index && <span className="selected-mark"><Icon name="check" size={15}/></span>}</button>)}</div>
    <div className="thumbnail-editor"><div><span className="eyebrow">TEXT OVERLAY</span><h3>{labels[selected]}</h3><p>Title stays fully editable after export.</p></div><div className="text-styles"><button className="style-picked">Aa</button><button>Aa</button><button>Aa</button><button className="color-dot"></button></div></div>
    <div className="stage-footer"><button className="text-button">Download PNG preview</button><button className="primary-button" onClick={onContinue}>Run pre-check <Icon name="arrow" size={16}/></button></div>
  </div>;
}

function ReviewStage({ issues, onApply, onContinue }: { issues: ComplianceIssue[]; onApply: (issue: ComplianceIssue) => void; onContinue: () => void }) {
  return <div className="stage-content">
    <StageTitle eyebrow="05 · PRE-CHECK" title={issues.length ? "A little care before you publish." : "Your project is ready for a final review."} copy="This automated pre-check is advisory, not a compliance guarantee." />
    <div className="review-summary"><div className={`review-orb ${issues.length ? "needs-care" : "clear"}`}>{issues.length ? <Icon name="warning" size={27}/> : <Icon name="check" size={28}/>}</div><div><b>{issues.length ? `${issues.length} item${issues.length > 1 ? "s" : ""} to review` : "No current flags"}</b><p>{issues.length ? "We found a few places where a small edit could make your story clearer." : "The advisory pass found no obvious content safety or policy markers."}</p></div><span className={issues.length ? "status-review" : "status-clear"}>{issues.length ? "Needs attention" : "Ready"}</span></div>
    {issues.length > 0 ? <div className="issue-list">{issues.map((issue) => <article key={issue.id} className="issue-card"><div className="issue-icon"><Icon name="warning" size={17}/></div><div className="issue-copy"><p><b>{issue.label}</b><span>{issue.reference}</span></p><div>{issue.detail}</div><small>Suggestion: {issue.suggestion}</small></div><button onClick={() => onApply(issue)}>Apply fix</button></article>)}</div> : <div className="all-clear"><span><Icon name="check" size={23}/></span><div><b>Everything is still in your hands.</b><p>Review YouTube&apos;s Community Guidelines and monetization policies before publishing.</p></div></div>}
    <div className="compliance-disclaimer">This is an automated pre-check—not legal advice or a guarantee of YouTube policy compliance. <a href="https://www.youtube.com/howyoutubeworks/policies/community-guidelines/" target="_blank" rel="noreferrer">Read Community Guidelines ↗</a></div>
    <div className="stage-footer"><button className="text-button">Re-run check</button><button className="primary-button" onClick={onContinue}>Approve & prepare export <Icon name="arrow" size={16}/></button></div>
  </div>;
}

function ExportStage({ projectName, exporting, progress, onExport }: { projectName: string; exporting: boolean; progress: number; onExport: () => void }) {
  return <div className="stage-content export-stage">
    <StageTitle eyebrow="06 · EXPORT" title={exporting ? "Your story is coming together." : "Made by you. Ready for them."} copy={exporting ? "We’re assembling your original assets into the final deliverables." : "Choose the files you need—every asset stays organized in your project."}/>
    <div className="export-hero"><div className="export-video"><div className="export-orb"></div><div className="export-lines"></div><span>CREATOR&apos;S BIBLE</span><button><Icon name="play"/></button></div><div className="export-info"><span className="ready-label">{exporting ? "RENDERING" : "PROJECT READY"}</span><h3>{projectName}</h3><p>Original idea · English (US) · 16:9</p>{exporting ? <><div className="render-progress"><i style={{ width: `${progress}%` }}></i></div><b>{progress < 100 ? `Rendering ${progress}%` : "Render complete"}</b></> : <div className="asset-tags"><span>1080p MP4</span><span>SRT captions</span><span>PNG thumbnail</span></div>}</div></div>
    <div className="export-options"><div><span className="file-icon"><Icon name="download" size={17}/></span><p><b>Long-form video</b><small>MP4 · 1920 × 1080 · 8:12</small></p><button className="outline-button" disabled={exporting && progress < 100}><Icon name="download" size={15}/>Download</button></div><div><span className="file-icon purple"><Icon name="sparkle" size={17}/></span><p><b>Vertical short</b><small>MP4 · 1080 × 1920 · 00:47</small></p><button className="outline-button" disabled={exporting && progress < 100}><Icon name="download" size={15}/>Download</button></div><div><span className="file-icon coral"><Icon name="folder" size={17}/></span><p><b>Creator bundle</b><small>Script · captions · all thumbnails</small></p><button className="outline-button" disabled={exporting && progress < 100}><Icon name="download" size={15}/>Download</button></div></div>
    <div className="stage-footer"><span className="cost-note">Final render uses 12 credits</span><button className="primary-button" onClick={onExport} disabled={exporting && progress < 100}>{exporting ? (progress === 100 ? "Ready to download" : "Rendering…") : <>Create final render <Icon name="arrow" size={16}/></>}</button></div>
  </div>;
}

function ScenesPanel({ active, onSelect }: { active: number; onSelect: (index: number) => void }) {
  return <div className="scenes-panel"><div className="panel-heading"><div><p className="eyebrow">SCRIPT BREAKDOWN</p><h3>Scenes <span>4</span></h3></div><button className="icon-button"><Icon name="dots"/></button></div><div className="scene-list">{scenes.map((scene, index) => <button onClick={() => onSelect(index)} className={`scene-card ${index === active ? "active" : ""}`} key={scene.number}><div className={`scene-thumb ${scene.tone}`}><span>{scene.number}</span></div><div><b>{scene.title}</b><small>{scene.duration}</small></div>{index === active && <Icon name="chevron" size={16}/>}</button>)}</div><button className="add-scene"><Icon name="plus" size={15}/> Add a scene</button><div className="scene-count"><span>4 scenes</span><span>~2 min 10 sec</span></div></div>;
}

function ProjectSnapshot({ activeStage, cost, issues }: { activeStage: Stage; cost: string; issues: number }) {
  const helper: Record<Stage, [string, string]> = {
    Script: ["Story first", "Nothing is locked until you decide it is."], Visuals: ["Visual direction", "Every scene remains editable."], Voice: ["Global-ready", "One script, many natural voices."], Thumbnail: ["Your click moment", "Explore hooks—not generic templates."], Review: ["Your final say", "Flags are surfaced, never silently changed."], Export: ["Your originals", "Download a full production bundle."],
  };
  return <div className="snapshot-panel"><div className="snapshot-art"><div></div><span>ORIGINAL<br/>STORY</span></div><p className="eyebrow">{helper[activeStage][0]}</p><h3>{helper[activeStage][1]}</h3><div className="snapshot-lines"><span><b>Project type</b><em>Long-form video</em></span><span><b>Est. production cost</b><em>${cost}</em></span><span><b>Content origin</b><em>AI from your idea</em></span>{activeStage === "Review" && <span><b>Open review items</b><em>{issues}</em></span>}</div><p className="origin-note"><Icon name="check" size={15}/>Original content workflow</p></div>;
}
