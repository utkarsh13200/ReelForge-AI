import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ProjectProvider } from "@/components/dashboard/project-provider";
import type { Project } from "@/lib/types/project";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const email = user?.email ?? "";
  const name = user?.user_metadata?.full_name || email.split("@")[0] || "Creator";

  let seedProject: Project | null = null;
  if (supabase && user) {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    seedProject = (data as Project | null) ?? null;
  }

  return (
    <ProjectProvider seedProject={seedProject}>
      <DashboardShell userName={name} userEmail={email}>
        {children}
      </DashboardShell>
    </ProjectProvider>
  );
}
