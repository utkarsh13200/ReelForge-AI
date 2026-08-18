import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateSceneVideo } from "@/lib/providers/scene-video";
import { fetchSceneImage } from "@/lib/providers/image";
import { createKenBurnsVideo } from "@/lib/visuals/ken-burns-video";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FalAspectRatio } from "@/lib/providers/fal-video";

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    prompt?: string;
    aspect_ratio?: FalAspectRatio;
    aspectRatio?: FalAspectRatio;
  };

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "A text prompt is required." }, { status: 400 });
  }

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
    let bytes = await generateSceneVideo(prompt, Date.now() % 10_000);
    if (!bytes?.length) {
      const still = await fetchSceneImage(prompt, Date.now() % 10_000);
      if (still?.length) bytes = await createKenBurnsVideo(still, 5);
    }
    if (!bytes?.length) {
      return NextResponse.json(
        { error: "Could not generate video from any provider. Try again in a moment." },
        { status: 502 }
      );
    }

    const admin = createAdminClient() ?? supabase;
    const storagePath = `${user.id}/${params.id}/t2v-${Date.now()}.mp4`;
    const { error: uploadError } = await admin.storage.from("visuals").upload(storagePath, bytes, {
      contentType: "video/mp4",
      upsert: true,
    });
    if (uploadError) throw new Error(uploadError.message);

    const url = admin.storage.from("visuals").getPublicUrl(storagePath).data.publicUrl;
    return NextResponse.json({ url, provider: "fallback-chain" });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Video generation failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
