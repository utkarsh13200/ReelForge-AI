const BASE = process.env.APP_URL || "https://reelforge-peach.vercel.app";
const P = "00000000-0000-0000-0000-0000000000proj";

async function check(name, fn) {
  try {
    const detail = await fn();
    console.log("PASS", name, detail || "");
    return true;
  } catch (e) {
    console.log("FAIL", name, e.message || e);
    return false;
  }
}

async function json(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { res, body, status: res.status, text: text.slice(0, 300) };
}

let pass = 0;
let fail = 0;

async function run(name, fn) {
  const ok = await check(name, fn);
  if (ok) pass += 1;
  else fail += 1;
}

/** Prefer POST completion; only poll if still running (Vercel multi-instance). */
async function settleJob(body, { maxPolls = 40, delayMs = 2000 } = {}) {
  let latest = body;
  if (latest.status === "completed" || latest.status === "failed") return latest;
  const id = body.jobId || body.id;
  if (!id) return latest;
  for (let i = 0; i < maxPolls; i++) {
    const poll = await json(`/api/jobs/${id}`);
    if (poll.status === 404 && (latest.status === "completed" || latest.audioUrl || latest.assets?.length)) {
      return latest;
    }
    latest = { ...latest, ...poll.body };
    if (latest.status === "completed" || latest.status === "failed") break;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return latest;
}

console.log("Vercel smoke →", BASE);

await run("home", async () => {
  const r = await fetch(BASE);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return String(r.status);
});

for (const p of [
  "/dashboard",
  "/dashboard/script",
  "/dashboard/visuals",
  "/dashboard/voice",
  "/dashboard/thumbnail",
  "/dashboard/edit",
  "/dashboard/export",
]) {
  await run(`page ${p}`, async () => {
    const r = await fetch(BASE + p);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return String(r.status);
  });
}

await run("01 load project", async () => {
  const { status, body } = await json(`/api/projects/${P}`);
  if (status !== 200 || !body?.project?.id) throw new Error(`${status} ${JSON.stringify(body).slice(0, 160)}`);
  return body.project.title || body.project.id;
});

await run("01 patch script", async () => {
  const { status, body } = await json(`/api/projects/${P}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      script:
        "Picture a boy in 1856 who would later electrify the world. Nikola Tesla reinvented electricity as a dance of waves. His AC system and coil powered modern grids.",
    }),
  });
  if (status !== 200) throw new Error(`${status} ${JSON.stringify(body).slice(0, 160)}`);
  return "ok";
});

await run("01 generate topic", async () => {
  const { status, body } = await json(`/api/projects/${P}/script/topic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic: "Printing press history", tone: "educational", durationMinutes: 1 }),
  });
  if (status !== 200 || !body.jobId) throw new Error(`${status} ${JSON.stringify(body).slice(0, 200)}`);
  const latest = await settleJob(body);
  if (latest.status !== "completed") throw new Error(`${latest.status} ${latest.error || ""}`);
  return "completed";
});

await run("02 load visuals", async () => {
  const { status, body } = await json(`/api/projects/${P}/visuals`);
  if (status !== 200) throw new Error(`${status} ${JSON.stringify(body).slice(0, 160)}`);
  return `assets=${(body.assets || []).length}`;
});

await run("02 generate image", async () => {
  const { status, body } = await json(`/api/projects/${P}/visuals/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "image",
      fromScript: true,
      script:
        "Picture a boy in 1856 who would later electrify the world. Nikola Tesla reinvented electricity as a dance of waves. His AC system and coil powered modern grids.",
    }),
  });
  if (status !== 200 || !body.jobId) throw new Error(`${status} ${JSON.stringify(body).slice(0, 220)}`);
  const latest = await settleJob(body, { maxPolls: 90, delayMs: 3000 });
  if (latest.status !== "completed") throw new Error(`${latest.status} ${latest.error || latest.message || ""}`);
  const stillsFromPost = (body.assets || latest.assets || []).filter((a) => a.url).length;
  if (stillsFromPost < 1) {
    const after = await json(`/api/projects/${P}/visuals`);
    const n = (after.body.assets || []).filter((a) => a.url).length;
    if (n < 1) throw new Error("completed but no still URLs");
    return `stills=${n} video=${!!after.body.project?.visual_video_url}`;
  }
  return `stills=${stillsFromPost} video=${!!(body.visualVideoUrl || latest.visualVideoUrl)}`;
});

await run("03 voices", async () => {
  const { status, body } = await json(`/api/voices`);
  if (status !== 200 || !(body.voices || []).length) throw new Error(`${status}`);
  return `count=${body.voices.length}`;
});

await run("03 generate voice", async () => {
  const { status, body } = await json(`/api/projects/${P}/voice/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voiceId: "en-US-JennyNeural" }),
  });
  if (status !== 200) throw new Error(`${status} ${JSON.stringify(body).slice(0, 200)}`);
  const latest = await settleJob(body, { maxPolls: 60, delayMs: 2000 });
  if (latest.status !== "completed" && !latest.audioUrl && !body.audioUrl) {
    throw new Error(`${latest.status} ${latest.error || JSON.stringify(latest).slice(0, 160)}`);
  }
  return `audio=${!!(latest.audioUrl || body.audioUrl)}`;
});

await run("04 thumbnails load", async () => {
  const { status, body } = await json(`/api/projects/${P}/thumbnail`);
  if (status !== 200) throw new Error(`${status} ${JSON.stringify(body).slice(0, 160)}`);
  return `count=${(body.thumbnails || []).length}`;
});

await run("04 generate thumbs", async () => {
  const form = new FormData();
  form.append("description", "Nikola Tesla cinematic thumbnail");
  form.append("headline", "NIKOLA TESLA");
  form.append("useProjectVideo", "true");
  const res = await fetch(`${BASE}/api/projects/${P}/thumbnail/generate`, { method: "POST", body: form });
  const body = await res.json().catch(() => ({}));
  if (res.status !== 200 || !(body.thumbnails || []).length) {
    throw new Error(`${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  }
  return `count=${body.thumbnails.length}`;
});

await run("05 edit load", async () => {
  const { status, body } = await json(`/api/projects/${P}/edit`);
  if (status !== 200) throw new Error(`${status} ${JSON.stringify(body).slice(0, 160)}`);
  return `timeline=${!!body.timeline}`;
});

await run("06 export load", async () => {
  const { status, body } = await json(`/api/projects/${P}/export`);
  if (status !== 200) throw new Error(`${status} ${JSON.stringify(body).slice(0, 160)}`);
  return "ok";
});

console.log(`\nSummary: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
