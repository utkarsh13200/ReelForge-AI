import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/require-api-user";

type Params = { params: { id: string } };

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

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
    return NextResponse.json({ error: "Missing image file." }, { status: 400 });
  }

  const lower = file.name.toLowerCase();
  const okType =
    file.type.startsWith("image/") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".webp");
  if (!okType) {
    return NextResponse.json({ error: "Upload a JPG, PNG, or WebP image." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image must be 8MB or smaller." }, { status: 400 });
  }

  const ext = lower.endsWith(".png") ? "png" : lower.endsWith(".webp") ? "webp" : "jpg";
  const path = `${userId}/${params.id}/image-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from("timeline").upload(path, bytes, {
    contentType: file.type || `image/${ext === "jpg" ? "jpeg" : ext}`,
    upsert: true,
  });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: publicData } = supabase.storage.from("timeline").getPublicUrl(path);
  const title = file.name.replace(/\.[^.]+$/, "") || "Uploaded image";

  return NextResponse.json({
    image: {
      id: `upload-${Date.now()}`,
      url: publicData.publicUrl,
      title,
    },
  });
}
