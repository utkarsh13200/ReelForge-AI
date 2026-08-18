"use client";

import { useRouter } from "next/navigation";
import { FolderOpen, Loader2, Plus } from "lucide-react";
import { useProject } from "@/components/dashboard/project-provider";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

export function ProjectSwitcher() {
  const router = useRouter();
  const { projects, activeProject, loading, setActiveProjectId, createProject } = useProject();

  async function handleNewProject() {
    await createProject(`Project ${new Date().toLocaleDateString()}`);
    router.push("/dashboard/script");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex min-w-0 items-center">
        <FolderOpen className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-forge" />
        <Select
          value={activeProject?.id ?? ""}
          onChange={(event) => {
            if (event.target.value) setActiveProjectId(event.target.value);
          }}
          className="h-9 max-w-[200px] appearance-none pl-9 pr-8 text-sm md:max-w-[240px]"
          aria-label="Select project"
        >
          {!projects.length ? <option value="">No projects</option> : null}
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </Select>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={handleNewProject} className="shrink-0">
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">New</span>
      </Button>
    </div>
  );
}
