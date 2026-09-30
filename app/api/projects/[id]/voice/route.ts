import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/require-api-user";
import * as demo from "@/lib/demo/api";

type Params = { params: { id: string } };

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  if (auth.isDemo) return demo.demoGetVoice(params.id);

  const supabase = auth.supabase!;
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", auth.user.id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const { data: voiceAsset, error: voiceError } = await supabase
    .from("voice_assets")
    .select("*")
    .eq("project_id", params.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (voiceError) return NextResponse.json({ error: voiceError.message }, { status: 500 });

  return NextResponse.json({ project, voiceAsset: voiceAsset ?? null });
}
