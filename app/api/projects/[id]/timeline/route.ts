import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { TimelineJson } from "@/lib/types/timeline";
import { normalizeTimeline } from "@/lib/timeline/recompute";

type Params = { params: { id: string } };

function isTimelineJson(value: unknown): value is TimelineJson {
  if (!value || typeof value !== "object") return false;
  const candidate = value as TimelineJson;
  return candidate.version === 1 && Array.isArray(candidate.scenes);
}

export async function PUT(request: Request, { params }: Params) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { timeline?: TimelineJson };
  if (!body.timeline || !isTimelineJson(body.timeline)) {
    return NextResponse.json({ error: "Invalid timeline payload." }, { status: 400 });
  }

  const timeline = normalizeTimeline(body.timeline);

  const { data, error } = await supabase
    .from("projects")
    .update({
      timeline_json: timeline,
      status: "in_progress",
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message || "Could not save timeline." }, { status: 500 });
  return NextResponse.json({ project: data, timeline });
}
