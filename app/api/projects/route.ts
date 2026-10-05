import { NextResponse } from "next/server";
import { finalizeDemoApi, requireApiUser } from "@/lib/auth/require-api-user";
import * as demo from "@/lib/demo/api";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  if (auth.isDemo) return demo.demoListProjects();

  const supabase = auth.supabase!;
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projects: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    source_type?: "topic" | "youtube_url";
  };

  if (auth.isDemo) {
    const response = demo.demoCreateProject(body);
    await finalizeDemoApi();
    return response;
  }

  const supabase = auth.supabase!;
  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: auth.user.id,
      title: body.title?.trim() || "Untitled project",
      source_type: body.source_type ?? null,
      status: "draft",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data });
}
