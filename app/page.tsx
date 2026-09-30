import Link from "next/link";
import {
  Download,
  FileText,
  ImageIcon,
  Mic2,
  Play,
  Scissors,
  Sparkles,
} from "lucide-react";
import { BrandLogo } from "@/components/marketing/brand-logo";
import { Button } from "@/components/ui/button";

const PIPELINE = [
  { step: "01", title: "Script", icon: FileText },
  { step: "02", title: "Visuals", icon: Sparkles },
  { step: "03", title: "Voice", icon: Mic2 },
  { step: "04", title: "Thumbnail", icon: ImageIcon },
  { step: "05", title: "Edit", icon: Scissors },
  { step: "06", title: "Export", icon: Download },
] as const;

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-white/10 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <BrandLogo />
          <Button asChild variant="outline" className="rounded-full px-5">
            <Link href="/dashboard/script">Open studio</Link>
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-6 py-16 text-center md:py-24">
          <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight md:text-6xl lg:text-7xl">
            AI Video Generator
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Prompt your video idea and ReelForge AI writes the script, generates visuals, adds
            voiceovers, thumbnails, timeline edits, and exports a publish-ready MP4 — all in one
            studio.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="h-12 min-w-[200px] rounded-full px-8 text-base">
              <Link href="/dashboard/script">Create now</Link>
            </Button>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            No account required. Projects are saved on this machine.
          </p>
        </section>

        <section className="border-t border-white/10 bg-black/30 px-6 pb-16 pt-10">
          <div className="mx-auto max-w-5xl">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-forge/10 via-card/80 to-background shadow-2xl shadow-black/40">
              <div className="border-b border-white/10 px-6 py-4 text-left">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Full studio preview
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Script → Visuals → Voice → Thumbnail → Edit → Export
                </p>
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {PIPELINE.map(({ step, title, icon: Icon }) => (
                  <div
                    key={title}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-background/60 px-4 py-3 text-left"
                  >
                    <span className="text-[10px] font-semibold text-forge">{step}</span>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{title}</span>
                    <span className="ml-auto h-2 w-2 rounded-full bg-emerald-400/80" />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 border-t border-white/10 px-6 py-5">
                <Button asChild className="rounded-full">
                  <Link href="/dashboard/script">
                    <Play className="h-4 w-4" />
                    Open studio
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-sm text-muted-foreground sm:flex-row">
          <BrandLogo href="/" size="sm" />
          <p>© {new Date().getFullYear()} ReelForge AI</p>
        </div>
      </footer>
    </div>
  );
}
