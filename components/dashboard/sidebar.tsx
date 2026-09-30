"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  FileText,
  Home,
  ImageIcon,
  Mic2,
  Scissors,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { BrandLogo } from "@/components/marketing/brand-logo";
import { useModuleNav } from "@/components/dashboard/module-nav";

const NAV = [
  { href: "/dashboard/script", label: "Script", step: "01", icon: FileText },
  { href: "/dashboard/visuals", label: "Visuals", step: "02", icon: Sparkles },
  { href: "/dashboard/voice", label: "Voice", step: "03", icon: Mic2 },
  { href: "/dashboard/thumbnail", label: "Thumbnail", step: "04", icon: ImageIcon },
  { href: "/dashboard/edit", label: "Edit", step: "05", icon: Scissors },
  { href: "/dashboard/export", label: "Export", step: "06", icon: Download },
] as const;

export function DashboardSidebar({
  userName,
  userEmail,
  mobileOpen = false,
  onNavigate,
}: {
  userName: string;
  userEmail: string;
  isDemo?: boolean;
  mobileOpen?: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const { activeHref, onNavClick } = useModuleNav();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-white/10 bg-card/95 backdrop-blur-xl transition-transform duration-300 lg:static lg:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}
    >
      <div className="flex items-center justify-between px-5 py-5">
        <BrandLogo href="/dashboard/script" size="sm" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onNavigate}
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <Separator className="bg-white/10" />

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Pipeline
        </p>
        {NAV.map(({ href, label, step, icon: Icon }) => {
          const active = activeHref.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              prefetch
              scroll={false}
              onClick={(event) => {
                onNavigate?.();
                onNavClick(href, event);
              }}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all",
                active
                  ? "bg-forge/15 text-forge shadow-inner shadow-forge/5"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              )}
            >
              {active ? (
                <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-forge" />
              ) : null}
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold",
                  active ? "bg-forge/20 text-forge" : "bg-white/5 text-muted-foreground group-hover:text-foreground"
                )}
              >
                {step}
              </span>
              <Icon className="h-4 w-4 shrink-0 opacity-80" />
              {label}
            </Link>
          );
        })}
      </nav>

      <Separator className="bg-white/10" />

      <div className="p-4">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <p className="truncate text-sm font-medium">{userName}</p>
          <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-3 w-full justify-start text-muted-foreground"
          onClick={() => router.replace("/")}
        >
          <Home className="h-4 w-4" />
          Home
        </Button>
      </div>
    </aside>
  );
}
