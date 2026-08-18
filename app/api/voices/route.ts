import { NextResponse } from "next/server";
import { listTtsVoices } from "@/lib/providers/tts";

export async function GET() {
  return NextResponse.json({ voices: listTtsVoices() });
}
