"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiFetch } from "@/lib/api/client";
import type { Project } from "@/lib/types/project";

const STORAGE_KEY = "reelforge-active-project";

type ProjectContextValue = {
  projects: Project[];
  activeProject: Project | null;
  activeProjectId: string | null;
  loading: boolean;
  setActiveProjectId: (id: string) => void;
  createProject: (title?: string) => Promise<Project>;
  refreshProjects: () => Promise<void>;
  updateProject: (project: Project) => void;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({
  children,
  seedProject,
}: {
  children: React.ReactNode;
  seedProject?: Project | null;
}) {
  const [projects, setProjects] = useState<Project[]>(seedProject ? [seedProject] : []);
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(seedProject?.id ?? null);
  const [loading, setLoading] = useState(true);

  const refreshProjects = useCallback(async () => {
    const data = await apiFetch<{ projects: Project[] }>("/api/projects");
    setProjects(data.projects ?? []);

    const savedId = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const preferred =
      (savedId && data.projects?.some((p) => p.id === savedId) ? savedId : null) ||
      data.projects?.[0]?.id ||
      null;

    setActiveProjectIdState(preferred);
  }, []);

  useEffect(() => {
    refreshProjects()
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [refreshProjects]);

  const setActiveProjectId = useCallback((id: string) => {
    setActiveProjectIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const createProject = useCallback(
    async (title = "Untitled project") => {
      const data = await apiFetch<{ project: Project }>("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, source_type: "topic" }),
      });
      await refreshProjects();
      setActiveProjectId(data.project.id);
      return data.project;
    },
    [refreshProjects, setActiveProjectId]
  );

  const updateProject = useCallback((project: Project) => {
    setProjects((current) => {
      const exists = current.some((item) => item.id === project.id);
      if (!exists) return [project, ...current];
      return current.map((item) => (item.id === project.id ? project : item));
    });
  }, []);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? projects[0] ?? null,
    [projects, activeProjectId]
  );

  const value = useMemo(
    () => ({
      projects,
      activeProject,
      activeProjectId: activeProject?.id ?? null,
      loading,
      setActiveProjectId,
      createProject,
      refreshProjects,
      updateProject,
    }),
    [projects, activeProject, loading, setActiveProjectId, createProject, refreshProjects, updateProject]
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used within ProjectProvider");
  }
  return context;
}
