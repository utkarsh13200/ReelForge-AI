import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadPipelineStatus } from "@/lib/project/load-pipeline-status";

type Params = { params: { id: string } };

export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  try {
    const pipeline = await loadPipelineStatus(supabase, params.id);
    return NextResponse.json({ pipeline });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load pipeline status." },
      { status: 500 }
    );
  }
}
