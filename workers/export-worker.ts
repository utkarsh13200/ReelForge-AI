/**
 * Background worker for Remotion export jobs.
 * Run on Railway, Render, Fly.io, or locally alongside the Next.js app.
 *
 * Usage:
 *   EXPORT_WORKER_MODE=true npm run dev          # web app defers export to worker
 *   npm run export:worker                        # this process
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { processExportJobStep } from "../lib/jobs/export-jobs";
import type { JobRecord } from "../lib/types/project";

loadEnv({ path: ".env.local" });
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const pollMs = Number(process.env.EXPORT_WORKER_POLL_MS ?? 4000);

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function claimNextJob(): Promise<JobRecord | null> {
  const { data: jobs, error } = await supabase
    .from("job_queue")
    .select("*")
    .eq("type", "export_render")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    console.error("Failed to query jobs:", error.message);
    return null;
  }

  const job = (jobs?.[0] as JobRecord | undefined) ?? null;
  if (!job) return null;

  if (job.status === "queued") {
    const { data: claimed, error: claimError } = await supabase
      .from("job_queue")
      .update({ status: "running", updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("status", "queued")
      .select("*")
      .maybeSingle();

    if (claimError) {
      console.error("Failed to claim job:", claimError.message);
      return null;
    }

    return (claimed as JobRecord | null) ?? null;
  }

  return job;
}

async function tick() {
  const job = await claimNextJob();
  if (!job) return;

  console.log(`Processing export job ${job.id}…`);
  try {
    const result = await processExportJobStep(supabase, job, job.user_id);
    console.log(`Job ${job.id} finished with status ${result.status}.`);
  } catch (error) {
    console.error(`Job ${job.id} crashed:`, error);
  }
}

console.log(`ReelForge export worker started (poll every ${pollMs}ms).`);
void tick();
setInterval(() => {
  void tick();
}, pollMs);
