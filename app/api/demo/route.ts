import { NextResponse } from "next/server";
import { ensureDemoSeed } from "@/lib/demo/store";

export async function GET(request: Request) {
  ensureDemoSeed();
  return NextResponse.redirect(new URL("/dashboard/script", request.url));
}

export async function POST(request: Request) {
  return GET(request);
}
