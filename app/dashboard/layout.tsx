import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ProjectProvider } from "@/components/dashboard/project-provider";
import type { Project } from "@/lib/types/project";
import { DEMO_EMAIL, DEMO_NAME, DEMO_PROJECT_ID } from "@/lib/demo/constants";
import { ensureDemoSeed, getDemoProject } from "@/lib/demo/store";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  ensureDemoSeed();
  const seedProject = getDemoProject(DEMO_PROJECT_ID) as Project | null;
  return (
    <ProjectProvider seedProject={seedProject}>
      <DashboardShell userName={DEMO_NAME} userEmail={DEMO_EMAIL}>
        {children}
      </DashboardShell>
    </ProjectProvider>
  );
}
