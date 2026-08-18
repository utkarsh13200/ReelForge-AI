import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { persistFinalThumbnail } from "@/lib/thumbnails/persist-thumbnail";
import type { ThumbnailOverlay } from "@/lib/types/thumbnail";

type Params = { params: { id: string; thumbnailId: string } };

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
  const overlayRaw = formData.get("overlay");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing PNG export." }, { status: 400 });
  }

  let overlay: ThumbnailOverlay | null = null;
  if (typeof overlayRaw === "string" && overlayRaw.trim()) {
    try {
      overlay = JSON.parse(overlayRaw) as ThumbnailOverlay;
    } catch {
      return NextResponse.json({ error: "Invalid overlay JSON." }, { status: 400 });
    }
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    const saved = await persistFinalThumbnail(supabase, user.id, params.id, params.thumbnailId, bytes);

    if (overlay) {
      const { data: updated, error: overlayError } = await supabase
        .from("thumbnails")
        .update({ overlay_json: overlay, headline: overlay.text })
        .eq("id", params.thumbnailId)
        .select("*")
        .single();

      if (overlayError) throw new Error(overlayError.message);
      return NextResponse.json({ thumbnail: updated ?? saved });
    }

    return NextResponse.json({ thumbnail: saved });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save thumbnail." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { overlay?: ThumbnailOverlay };
  if (!body.overlay) {
    return NextResponse.json({ error: "Missing overlay settings." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("thumbnails")
    .update({
      overlay_json: body.overlay,
      headline: body.overlay.text,
    })
    .eq("id", params.thumbnailId)
    .eq("project_id", params.id)
    .select("*")
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message || "Thumbnail not found." }, { status: 404 });
  return NextResponse.json({ thumbnail: data });
}
