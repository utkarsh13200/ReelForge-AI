import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = { params: { id: string } };

export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const { data: assets, error: assetsError } = await supabase
    .from("visual_assets")
    .select("*")
    .eq("project_id", params.id)
    .order("scene_index", { ascending: true });

  if (assetsError) return NextResponse.json({ error: assetsError.message }, { status: 500 });

  return NextResponse.json({ project, assets: assets ?? [] });
}
