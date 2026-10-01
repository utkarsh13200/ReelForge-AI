import { join } from "path";
import { tmpdir } from "os";

/** Vercel / serverless — ephemeral FS, no shared memory across invocations. */
export function isServerlessRuntime() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/** Persist demo store + media under /tmp on serverless so writes are allowed. */
export function demoDataRoot() {
  if (isServerlessRuntime()) {
    return join(tmpdir(), "reelforge-demo");
  }
  return join(process.cwd(), ".data", "demo");
}

export function preferSyncJobs() {
  // On serverless, a later poll often hits a different instance without the job.
  return isServerlessRuntime() || process.env.SYNC_JOBS === "true";
}
