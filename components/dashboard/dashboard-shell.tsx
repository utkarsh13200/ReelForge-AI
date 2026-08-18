"use client";

import { useState } from "react";
import { Clapperboard, Menu } from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardPipelineHeader } from "@/components/dashboard/dashboard-pipeline-header";
import { DashboardModuleHost } from "@/components/dashboard/dashboard-module-host";
import { ModuleNavProvider } from "@/components/dashboard/module-nav";
import { Button } from "@/components/ui/button";

export function DashboardShell({
  children,
  userName,
  userEmail,
}: {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <ModuleNavProvider>
      <div className="flex min-h-screen bg-background">
        {mobileOpen ? (
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        ) : null}

        <DashboardSidebar
          userName={userName}
          userEmail={userEmail}
          mobileOpen={mobileOpen}
          onNavigate={() => setMobileOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-white/10 bg-background/80 px-4 backdrop-blur-xl md:px-6">
            <div className="flex min-w-0 items-center gap-2 md:gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="hidden min-w-0 items-center gap-2 text-sm text-muted-foreground sm:flex">
                <Clapperboard className="h-4 w-4 shrink-0 text-forge" />
                <span>Production pipeline</span>
              </div>
              <DashboardPipelineHeader />
            </div>
          </header>
          <main className="mesh-bg flex-1 overflow-auto p-4 md:p-8">
            <DashboardModuleHost />
            <div hidden>{children}</div>
          </main>
        </div>
      </div>
    </ModuleNavProvider>
  );
}
