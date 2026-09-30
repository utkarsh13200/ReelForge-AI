import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/require-api-user";
import * as demo from "@/lib/demo/api";
import { loadPipelineStatus } from "@/lib/project/load-pipeline-status";

type Params = { params: { id: string } };

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  if (auth.isDemo) return demo.demoGetPipeline(params.id);

  const supabase = auth.supabase!;
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", auth.user.id)
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
