import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/require-api-user";
import * as demo from "@/lib/demo/api";

type Params = { params: { id: string } };

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  if (auth.isDemo) return demo.demoGetThumbnails(params.id);

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

  const { data: thumbnails, error: thumbnailsError } = await supabase
    .from("thumbnails")
    .select("*")
    .eq("project_id", params.id)
    .order("created_at", { ascending: true });

  if (thumbnailsError) return NextResponse.json({ error: thumbnailsError.message }, { status: 500 });

  const selected = thumbnails?.find((row) => row.is_selected) ?? null;

  return NextResponse.json({
    project,
    thumbnails: thumbnails ?? [],
    selectedThumbnail: selected,
  });
}
