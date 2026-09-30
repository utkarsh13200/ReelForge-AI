import { NextResponse } from "next/server";
import { getDemoMedia } from "@/lib/demo/media-store";

type Params = { params: { bucket: string; path: string[] } };

export async function GET(_request: Request, { params }: Params) {
  const path = params.path.map(decodeURIComponent).join("/");
  const entry = getDemoMedia(params.bucket, path);
  if (!entry) {
    return NextResponse.json({ error: "Media not found." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(entry.bytes), {
    headers: {
      "Content-Type": entry.contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
