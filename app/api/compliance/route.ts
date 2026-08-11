import { NextResponse } from "next/server";
import { runAdvisoryCheck } from "../../../lib/advisory-check";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";

  if (!content) {
    return NextResponse.json({ error: "A script is required for an advisory check." }, { status: 400 });
  }

  return NextResponse.json({
    status: "advisory",
    issues: runAdvisoryCheck(content),
    disclaimer: "This automated pre-check is not legal advice or a compliance guarantee.",
  });
}
