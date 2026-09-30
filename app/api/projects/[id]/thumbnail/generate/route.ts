import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/require-api-user";
import {
  generateThumbnailCandidates,
  MAX_UPLOAD_IMAGE_BYTES,
  MAX_UPLOAD_VIDEO_BYTES,
} from "@/lib/thumbnails/generate-candidates";

type Params = { params: { id: string } };

export const maxDuration = 300;

async function fileToBuffer(file: File | null, maxBytes: number, label: string): Promise<Buffer | null> {
  if (!file) return null;
  if (file.size > maxBytes) {
    throw new Error(`${label} is too large. Max ${Math.round(maxBytes / (1024 * 1024))}MB.`);
  }
  return Buffer.from(await file.arrayBuffer());
}

async function parseGenerateBody(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const video = form.get("video");
    const reference = form.get("reference");
    return {
      description: String(form.get("description") || ""),
      youtubeUrl: String(form.get("youtubeUrl") || ""),
      headline: String(form.get("headline") || ""),
      useProjectVideo: String(form.get("useProjectVideo") || "") === "true",
      videoFile: video instanceof File && video.size > 0 ? video : null,
      referenceFile: reference instanceof File && reference.size > 0 ? reference : null,
    };
  }

  const json = (await request.json().catch(() => ({}))) as {
    description?: string;
    youtubeUrl?: string;
    headline?: string;
    useProjectVideo?: boolean;
  };
  return {
    description: json.description ?? "",
    youtubeUrl: json.youtubeUrl ?? "",
    headline: json.headline ?? "",
    useProjectVideo: Boolean(json.useProjectVideo),
    videoFile: null,
    referenceFile: null,
  };
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const supabase = auth.supabase!;
  const userId = auth.user.id;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, title, script, visual_video_url, source_url")
    .eq("id", params.id)
    .eq("user_id", userId)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  let body;
  try {
    body = await parseGenerateBody(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid thumbnail request." },
      { status: 400 }
    );
  }

  let videoBytes: Buffer | null = null;
  let referenceBytes: Buffer | null = null;
  try {
    videoBytes = await fileToBuffer(body.videoFile, MAX_UPLOAD_VIDEO_BYTES, "Video");
    referenceBytes = await fileToBuffer(body.referenceFile, MAX_UPLOAD_IMAGE_BYTES, "Reference image");
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read uploaded files." },
      { status: 400 }
    );
  }

  const payload = {
    kind: "thumbnail_generate",
    projectId: params.id,
    prompts: [] as string[],
    headline: body.headline,
    currentIndex: 0,
    thumbnailIds: [] as string[],
    message: "Generating thumbnail candidates…",
  };

  const { data: job, error: jobError } = await supabase
    .from("job_queue")
    .insert({
      user_id: userId,
      project_id: params.id,
      type: "thumbnail_generate",
      payload,
      status: "running",
      progress: 10,
    })
    .select("*")
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: jobError?.message || "Could not start thumbnail job." }, { status: 500 });
  }

  try {
    const { rows, headline } = await generateThumbnailCandidates(supabase, userId, params.id, {
      title: project.title,
      script: project.script,
      visualVideoUrl: project.visual_video_url,
      sourceUrl: project.source_url,
      description: body.description,
      youtubeUrl: body.youtubeUrl,
      headline: body.headline,
      useProjectVideo: body.useProjectVideo,
      videoBytes,
      referenceBytes,
    });

    await supabase
      .from("job_queue")
      .update({
        status: "completed",
        progress: 100,
        payload: {
          ...payload,
          prompts: rows.map((row) => String(row.prompt ?? "")),
          headline,
          currentIndex: rows.length,
          thumbnailIds: rows.map((row) => row.id as string),
          message: "Thumbnail candidates ready.",
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return NextResponse.json({
      jobId: job.id,
      candidateCount: rows.length,
      headline,
      thumbnails: rows,
      status: "completed",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not generate thumbnails.";
    await supabase
      .from("job_queue")
      .update({
        status: "failed",
        error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return NextResponse.json({ error: message, jobId: job.id }, { status: 502 });
  }
}
