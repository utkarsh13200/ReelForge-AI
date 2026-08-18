import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
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

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing audio file." }, { status: 400 });
  }

  if (!file.type.startsWith("audio/") && !file.name.toLowerCase().endsWith(".mp3")) {
    return NextResponse.json({ error: "Upload an MP3 or audio file." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const path = `${user.id}/${params.id}/music-${Date.now()}.mp3`;
  const storageClient = createAdminClient() ?? supabase;
  const { error: uploadError } = await storageClient.storage.from("timeline").upload(path, bytes, {
    contentType: file.type || "audio/mpeg",
    upsert: true,
  });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: publicData } = storageClient.storage.from("timeline").getPublicUrl(path);

  return NextResponse.json({
    music: {
      source: "upload" as const,
      url: publicData.publicUrl,
      name: file.name.replace(/\.[^.]+$/, "") || "Uploaded track",
      volume: 0.35,
    },
  });
}
