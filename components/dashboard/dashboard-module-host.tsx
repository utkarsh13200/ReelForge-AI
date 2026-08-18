"use client";

import { ScriptWorkspace } from "@/components/script/script-workspace";
import { VisualsWorkspace } from "@/components/visuals/visuals-workspace";
import { VoiceWorkspace } from "@/components/voice/voice-workspace";
import { ThumbnailWorkspace } from "@/components/thumbnail/thumbnail-workspace";
import { EditWorkspace } from "@/components/edit/edit-workspace";
import { ExportWorkspace } from "@/components/export/export-workspace";
import { useModuleNav } from "@/components/dashboard/module-nav";
import { useProject } from "@/components/dashboard/project-provider";

export function DashboardModuleHost() {
  const { activeHref } = useModuleNav();
  const { activeProject } = useProject();

  if (activeHref.startsWith("/dashboard/visuals")) {
    return <VisualsWorkspace initialProject={activeProject} />;
  }
  if (activeHref.startsWith("/dashboard/voice")) {
    return <VoiceWorkspace initialProject={activeProject} />;
  }
  if (activeHref.startsWith("/dashboard/thumbnail")) {
    return <ThumbnailWorkspace initialProject={activeProject} />;
  }
  if (activeHref.startsWith("/dashboard/edit")) {
    return <EditWorkspace initialProject={activeProject} />;
  }
  if (activeHref.startsWith("/dashboard/export")) {
    return <ExportWorkspace initialProject={activeProject} />;
  }
  return <ScriptWorkspace initialProject={activeProject} />;
}
