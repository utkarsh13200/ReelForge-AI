import Link from "next/link";
import {
  ArrowRight,
  Clapperboard,
  Download,
  FileText,
  ImageIcon,
  Mic2,
  Scissors,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import { BrandLogo } from "@/components/marketing/brand-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const PIPELINE = [
  { step: "01", title: "Script", icon: FileText, copy: "Topic generation or YouTube transcript cleanup with chunked long-form output." },
  { step: "02", title: "Visuals", icon: Sparkles, copy: "LLM scene split plus Pollinations stills and Ken Burns motion hooks." },
  { step: "03", title: "Voice", icon: Mic2, copy: "Neural narration via edge-tts with word-level caption timing." },
  { step: "04", title: "Thumbnail", icon: ImageIcon, copy: "AI backgrounds with a canvas editor for bold headline overlays." },
  { step: "05", title: "Edit", icon: Scissors, copy: "Reorder scenes, style captions, and mix background music on a timeline." },
  { step: "06", title: "Export", icon: Download, copy: "Remotion MP4 renders for YouTube, Shorts, and square formats." },
] as const;

const STATS = [
  { value: "6", label: "Pipeline modules" },
  { value: "0", label: "Keys for images & TTS" },
  { value: "3", label: "Export aspect ratios" },
] as const;

export default function LandingPage() {
  return (
    <div className="min-h-screen mesh-bg">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <BrandLogo />
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/login">
                Get started
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pb-16 pt-16 md:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <Badge className="mb-6">Topic → finished video</Badge>
              <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl">
                Your entire YouTube production pipeline,{" "}
                <span className="bg-gradient-to-r from-forge to-orange-300 bg-clip-text text-transparent">
                  in one studio
                </span>
                .
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                ReelForge AI turns a topic or YouTube video into script, scene visuals, voiceover,
                thumbnail, timeline edit, and MP4 export — without juggling five different tools.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="/login">
                    Start for free
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/login">Open studio</Link>
                </Button>
              </div>
              <div className="mt-10 grid max-w-lg grid-cols-3 gap-4">
                {STATS.map(({ value, label }) => (
                  <div key={label} className="rounded-xl border border-white/10 bg-card/40 px-4 py-3">
                    <p className="font-display text-2xl font-semibold text-forge">{value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-panel relative overflow-hidden p-6 md:p-8">
              <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-forge/20 blur-3xl" />
              <div className="relative space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clapperboard className="h-4 w-4 text-forge" />
                  Live pipeline preview
                </div>
                <div className="space-y-2">
                  {PIPELINE.slice(0, 4).map(({ step, title, icon: Icon }) => (
                    <div
                      key={title}
                      className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-4 py-3"
                    >
                      <span className="text-[10px] font-semibold text-forge">{step}</span>
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{title}</span>
                      <span className="ml-auto h-2 w-2 rounded-full bg-emerald-400/80" />
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-dashed border-forge/30 bg-forge/5 px-4 py-3 text-sm text-muted-foreground">
                  <Wand2 className="mb-2 h-4 w-4 text-forge" />
                  Script → Visuals → Voice → Thumbnail → Edit → Export
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-black/20 py-16">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-10 max-w-2xl">
              <p className="kicker mb-3">End-to-end workflow</p>
              <h2 className="section-title">Six modules. One cohesive studio.</h2>
              <p className="mt-3 text-muted-foreground">
                Each step feeds the next — your script becomes scenes, scenes become a timeline,
                and the timeline becomes a publish-ready video.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PIPELINE.map(({ step, title, icon: Icon, copy }) => (
                <Card key={title} className="pipeline-card">
                  <CardContent className="space-y-4 p-6">
                    <div className="flex items-center justify-between">
                      <span className="kicker">{step}</span>
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-forge/10">
                        <Icon className="h-4 w-4 text-forge" />
                      </div>
                    </div>
                    <h3 className="font-display text-xl font-semibold">{title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{copy}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="glass-panel grid gap-8 p-8 md:grid-cols-[1fr_auto] md:items-center md:p-10">
            <div>
              <div className="mb-4 flex items-center gap-2 text-forge">
                <Zap className="h-5 w-5" />
                <span className="text-sm font-medium">Built for creators who ship</span>
              </div>
              <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
                Stop stitching tools together. Start forging videos.
              </h2>
              <p className="mt-3 max-w-xl text-muted-foreground">
                Free image generation, free TTS, and a guided pipeline that keeps your project
                moving from idea to export.
              </p>
            </div>
            <Button asChild size="lg" className="shrink-0">
              <Link href="/login">
                Enter the studio
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground sm:flex-row">
          <BrandLogo href="/" size="sm" />
          <p>© {new Date().getFullYear()} ReelForge AI. Topic to finished video.</p>
        </div>
      </footer>
    </div>
  );
}
