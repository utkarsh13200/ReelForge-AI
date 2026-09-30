import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/require-api-user";
import * as demo from "@/lib/demo/api";
import { countWords } from "@/lib/script/utils";

type Params = { params: { id: string } };

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  if (auth.isDemo) return demo.demoGetProject(params.id);

  const supabase = auth.supabase!;
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", auth.user.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ project: data });
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await request.json()) as { title?: string; script?: string };
  if (auth.isDemo) return demo.demoPatchProject(params.id, body);

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string") updates.title = body.title.trim() || "Untitled project";
  if (typeof body.script === "string") {
    updates.script = body.script;
    updates.script_word_count = countWords(body.script);
  }

  const supabase = auth.supabase!;
  const { data, error } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", params.id)
    .eq("user_id", auth.user.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data });
}
