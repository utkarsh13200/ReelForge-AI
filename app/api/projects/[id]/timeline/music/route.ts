import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/require-api-user";

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const supabase = auth.supabase!;
  const userId = auth.user.id;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", userId)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing audio file." }, { status: 400 });
  }

  if (!file.type.startsWith("audio/") && !file.name.toLowerCase().endsWith(".mp3")) {
    return NextResponse.json({ error: "Upload an MP3 or audio file." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const path = `${userId}/${params.id}/music-${Date.now()}.mp3`;
  const { error: uploadError } = await supabase.storage.from("timeline").upload(path, bytes, {
    contentType: file.type || "audio/mpeg",
    upsert: true,
  });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: publicData } = supabase.storage.from("timeline").getPublicUrl(path);

  return NextResponse.json({
    music: {
      source: "upload" as const,
      url: publicData.publicUrl,
      name: file.name.replace(/\.[^.]+$/, "") || "Uploaded track",
      volume: 0.35,
    },
  });
}
