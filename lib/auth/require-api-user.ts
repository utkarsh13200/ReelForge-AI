import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO_EMAIL, DEMO_USER_ID } from "@/lib/demo/constants";
import { ensureDemoSeed } from "@/lib/demo/store";
import { createDemoSupabaseClient } from "@/lib/demo/supabase-shim";

export type ApiUser = { id: string; email?: string | null };

export type ApiAuthResult =
  | { ok: true; user: ApiUser; isDemo: boolean; supabase: SupabaseClient | null }
  | { ok: false; status: number; message: string };

const localUser: ApiUser = { id: DEMO_USER_ID, email: DEMO_EMAIL };

export async function requireApiUser(): Promise<ApiAuthResult> {
  ensureDemoSeed();
  return { ok: true, user: localUser, isDemo: true, supabase: createDemoSupabaseClient() };
}
