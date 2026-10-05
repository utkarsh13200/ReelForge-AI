const BASE = process.env.APP_URL || "http://localhost:3001";
const PROJECT = "00000000-0000-0000-0000-0000000000proj";
const SCRIPT =
  "Picture a boy in 1856 who would later electrify the world. Nikola Tesla reinvented electricity as a dance of waves. His AC system and coil powered modern grids. Every lightbulb and phone still carries his vision.";

async function json(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const gen = await json(`/api/projects/${PROJECT}/visuals/generate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "image", fromScript: true, script: SCRIPT }),
});
console.log("generate", gen.status, gen.body?.jobId || gen.body?.error);
if (!gen.body?.jobId) process.exit(1);

let latest = gen.body;
for (let i = 0; i < 120; i++) {
  const poll = await json(`/api/jobs/${gen.body.jobId}`);
  latest = poll.body;
  if (latest.status === "completed" || latest.status === "failed") break;
  await new Promise((r) => setTimeout(r, 3000));
}
console.log("job", latest.status, latest.error || latest.message || "");

const after = await json(`/api/projects/${PROJECT}/visuals`);
const withUrl = (after.body.assets || []).filter((a) => a.url);
console.log(
  JSON.stringify({
    stills: withUrl.length,
    video: Boolean(after.body.project?.visual_video_url),
    sceneCount: latest.sceneCount ?? latest.payload?.sceneCount,
  })
);
process.exit(latest.status === "completed" && withUrl.length >= 7 ? 0 : 1);
