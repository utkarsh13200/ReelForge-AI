import type { SupabaseClient } from "@supabase/supabase-js";

/** Tiny ffmpeg color bars are ~1.6KB; real photos are much larger. */
export const MIN_USABLE_STILL_BYTES = 8_000;

export function isUsableStill(bytes: Buffer | null | undefined): bytes is Buffer {
  return Boolean(bytes && bytes.length >= MIN_USABLE_STILL_BYTES);
}

/** Local studio storage — always the in-app store, never a remote bucket. */
export function visualsStorageClient(supabase: SupabaseClient) {
  return supabase;
}
