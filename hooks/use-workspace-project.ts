"use client";

import { useEffect, useState } from "react";
import { useProject } from "@/components/dashboard/project-provider";
import type { Project } from "@/lib/types/project";

/** Keeps workspace state in sync with the global active project. */
export function useWorkspaceProject(initialProject: Project | null) {
  const { activeProject, activeProjectId, updateProject, setActiveProjectId } = useProject();
  const [project, setProjectState] = useState<Project | null>(initialProject ?? activeProject);

  useEffect(() => {
    if (activeProject) {
      setProjectState(activeProject);
    }
  }, [activeProjectId, activeProject]);

  const setProject = (next: Project | null) => {
    setProjectState(next);
    if (next) {
      updateProject(next);
      setActiveProjectId(next.id);
    }
  };

  return { project, setProject, activeProjectId };
}
