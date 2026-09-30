/**
 * Live smoke test for all ReelForge modules.
 * Run: node scripts/smoke-all-modules.mjs
 */
const BASE = process.env.APP_URL || "http://localhost:3001";
const PROJECT = "00000000-0000-0000-0000-0000000000proj";

const results = [];

function ok(module, option, detail = "") {
  results.push({ module, option, pass: true, detail });
  console.log(`PASS  [${module}] ${option}${detail ? ` — ${detail}` : ""}`);
}
function fail(module, option, detail = "") {
  results.push({ module, option, pass: false, detail });
  console.log(`FAIL  [${module}] ${option}${detail ? ` — ${detail}` : ""}`);
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
  return { res, body, status: res.status };
}

async function head(path) {
  const res = await fetch(`${BASE}${path}`, { method: "HEAD" });
  return res;
}

async function main() {
  console.log(`\nSmoke test → ${BASE}\n`);

  // --- Module 01 Script ---
  {
    const get = await json(`/api/projects/${PROJECT}`);
    if (get.status === 200 && get.body?.project?.id) {
      ok("01 Script", "Load project", get.body.project.title || PROJECT);
    } else {
      fail("01 Script", "Load project", `${get.status} ${get.body?.error || ""}`);
    }

    const topic = await json(`/api/projects/${PROJECT}/script/topic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "History of the printing press",
        tone: "educational",
        durationMinutes: 1,
      }),
    });
    if (topic.status === 200 && topic.body?.jobId) {
      const job = await json(`/api/jobs/${topic.body.jobId}`);
      if (job.body?.status === "completed" || job.body?.status === "running" || job.body?.status === "queued") {
        // Poll until done (max ~90s)
        let latest = job.body;
        for (let i = 0; i < 30; i++) {
          if (latest.status === "completed" || latest.status === "failed") break;
          await new Promise((r) => setTimeout(r, 2000));
          const poll = await json(`/api/jobs/${topic.body.jobId}`);
          latest = poll.body;
        }
        if (latest.status === "completed" && (latest.script || latest.payload?.script)) {
          ok("01 Script", "Generate from topic", `status=${latest.status}`);
        } else if (latest.status === "completed") {
          // Some responses put script on project
          const after = await json(`/api/projects/${PROJECT}`);
          if (after.body?.project?.script?.trim()) {
            ok("01 Script", "Generate from topic", `script words=${after.body.project.script_word_count || "?"}`);
          } else {
            fail("01 Script", "Generate from topic", `completed but no script on project`);
          }
        } else {
          fail("01 Script", "Generate from topic", `${latest.status} ${latest.error || ""}`);
        }
      } else {
        fail("01 Script", "Generate from topic", `${topic.status} job=${JSON.stringify(job.body).slice(0, 120)}`);
      }
    } else {
      fail("01 Script", "Generate from topic", `${topic.status} ${topic.body?.error || JSON.stringify(topic.body).slice(0, 120)}`);
    }

    const patch = await json(`/api/projects/${PROJECT}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        script:
          "The printing press changed how knowledge spread across continents. Books became affordable for ordinary people. Ideas traveled faster than armies. Literacy rose as printed pages filled homes and classrooms. Today every library still owes a debt to that invention.",
      }),
    });
    if (patch.status === 200 && patch.body?.project?.script?.includes("printing press")) {
      ok("01 Script", "Save/edit script", `words=${patch.body.project.script_word_count}`);
    } else {
      fail("01 Script", "Save/edit script", `${patch.status} ${patch.body?.error || ""}`);
    }
  }

  // Ensure we have a stable short script for downstream modules
  await json(`/api/projects/${PROJECT}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Nikola Tesla",
      script:
        "Picture a boy in 1856 who would later electrify the world. Nikola Tesla reinvented electricity as a dance of waves. His AC system and coil powered modern grids. Every lightbulb and phone still carries his vision.",
    }),
  });

  // --- Module 02 Visuals ---
  {
    const load = await json(`/api/projects/${PROJECT}/visuals`);
    if (load.status === 200) {
      ok("02 Visuals", "Load visuals", `assets=${(load.body.assets || []).length}`);
    } else {
      fail("02 Visuals", "Load visuals", `${load.status} ${load.body?.error || ""}`);
    }

    // Generate image mode from script (can take a while)
    const gen = await json(`/api/projects/${PROJECT}/visuals/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "image",
        fromScript: true,
        script:
          "Picture a boy in 1856 who would later electrify the world. Nikola Tesla reinvented electricity as a dance of waves. His AC system and coil powered modern grids. Every lightbulb and phone still carries his vision.",
      }),
    });

    if (gen.status === 200 && gen.body?.jobId) {
      let latest = gen.body;
      for (let i = 0; i < 90; i++) {
        const poll = await json(`/api/jobs/${gen.body.jobId}`);
        latest = poll.body;
        if (latest.status === "completed" || latest.status === "failed") break;
        await new Promise((r) => setTimeout(r, 3000));
      }
      if (latest.status === "completed") {
        const after = await json(`/api/projects/${PROJECT}/visuals`);
        const withUrl = (after.body.assets || []).filter((a) => a.url);
        const video = after.body.project?.visual_video_url;
        if (withUrl.length >= 1 && video) {
          ok("02 Visuals", "Generate Image from script", `stills=${withUrl.length} video=yes`);
        } else if (withUrl.length >= 1) {
          ok("02 Visuals", "Generate Image from script", `stills=${withUrl.length} video=missing`);
        } else {
          fail("02 Visuals", "Generate Image from script", `completed but no still URLs`);
        }
      } else {
        fail("02 Visuals", "Generate Image from script", `${latest.status} ${latest.error || latest.message || ""}`);
      }
    } else {
      fail("02 Visuals", "Generate Image from script", `${gen.status} ${gen.body?.error || JSON.stringify(gen.body).slice(0, 160)}`);
    }

    // Split endpoint
    const split = await json(`/api/projects/${PROJECT}/visuals/split`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        script:
          "Picture a boy in 1856 who would later electrify the world. Nikola Tesla reinvented electricity as a dance of waves. His AC system and coil powered modern grids. Every lightbulb and phone still carries his vision.",
        mode: "image",
      }),
    });
    if (split.status === 200 && (split.body?.jobId || split.body?.assets || split.body?.status)) {
      ok("02 Visuals", "Split scenes", split.body.jobId ? `job=${split.body.jobId}` : "ok");
    } else {
      fail("02 Visuals", "Split scenes", `${split.status} ${split.body?.error || ""}`);
    }
  }

  // --- Module 03 Voice ---
  {
    const voices = await json(`/api/voices`);
    if (voices.status === 200 && (voices.body.voices || []).length) {
      ok("03 Voice", "List voices", `count=${voices.body.voices.length}`);
    } else {
      fail("03 Voice", "List voices", `${voices.status}`);
    }

    const load = await json(`/api/projects/${PROJECT}/voice`);
    if (load.status === 200) {
      ok("03 Voice", "Load voice page data", load.body.voiceAsset?.audio_url ? "has audio" : "no audio yet");
    } else {
      fail("03 Voice", "Load voice page data", `${load.status} ${load.body?.error || ""}`);
    }

    const gen = await json(`/api/projects/${PROJECT}/voice/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId: "en-US-JennyNeural" }),
    });
    let voiceLatest = gen.body;
    const voiceJobId = gen.body?.jobId || gen.body?.id;
    if (gen.status === 200 && voiceJobId && voiceLatest.status !== "completed" && !voiceLatest.audioUrl) {
      for (let i = 0; i < 60; i++) {
        if (voiceLatest.status === "completed" || voiceLatest.status === "failed") break;
        await new Promise((r) => setTimeout(r, 2000));
        const poll = await json(`/api/jobs/${voiceJobId}`);
        voiceLatest = poll.body;
      }
    }
    if (
      gen.status === 200 &&
      (voiceLatest.status === "completed" || voiceLatest.audioUrl)
    ) {
      const url = voiceLatest.audioUrl;
      if (url) {
        const media = await head(url.startsWith("http") ? url.replace(BASE, "") : url);
        if (media.status === 200) {
          ok(
            "03 Voice",
            "Generate voiceover",
            `duration=${voiceLatest.durationSeconds || "?"} audio=200`
          );
        } else {
          fail("03 Voice", "Generate voiceover", `audio HEAD ${media.status}`);
        }
      } else {
        ok("03 Voice", "Generate voiceover", "completed");
      }
    } else {
      fail(
        "03 Voice",
        "Generate voiceover",
        `${gen.status} ${voiceLatest?.error || voiceLatest?.status || JSON.stringify(voiceLatest).slice(0, 160)}`
      );
    }
  }

  // --- Module 04 Thumbnail ---
  {
    const load = await json(`/api/projects/${PROJECT}/thumbnail`);
    if (load.status === 200) {
      ok("04 Thumbnail", "Load thumbnails", `count=${(load.body.thumbnails || []).length}`);
    } else {
      fail("04 Thumbnail", "Load thumbnails", `${load.status} ${load.body?.error || ""}`);
    }

    const form = new FormData();
    form.append("description", "Nikola Tesla with electric arcs, dramatic cinematic thumbnail");
    form.append("headline", "NIKOLA TESLA");
    form.append("useProjectVideo", "true");

    const gen = await fetch(`${BASE}/api/projects/${PROJECT}/thumbnail/generate`, {
      method: "POST",
      body: form,
    });
    const genBody = await gen.json().catch(() => ({}));
    if (gen.status === 200 && (genBody.thumbnails || []).length) {
      const first = genBody.thumbnails[0];
      ok("04 Thumbnail", "Generate candidates", `count=${genBody.thumbnails.length}`);

      // Select / save first candidate with a tiny PNG
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64"
      );
      const saveForm = new FormData();
      saveForm.append("file", new Blob([png], { type: "image/png" }), "thumbnail.png");
      saveForm.append(
        "overlay",
        JSON.stringify({
          text: "NIKOLA TESLA",
          subtext: "Invented the future",
          x: 80,
          y: 520,
          fontSize: 72,
          color: "#FFFFFF",
          strokeColor: "#000000",
          strokeWidth: 8,
          align: "left",
        })
      );
      const save = await fetch(`${BASE}/api/projects/${PROJECT}/thumbnail/${first.id}`, {
        method: "POST",
        body: saveForm,
      });
      const saveBody = await save.json().catch(() => ({}));
      if (save.status === 200 && saveBody.thumbnail?.is_selected) {
        ok("04 Thumbnail", "Select & save thumbnail", saveBody.thumbnail.id);
      } else {
        fail("04 Thumbnail", "Select & save thumbnail", `${save.status} ${saveBody.error || ""}`);
      }
    } else {
      fail("04 Thumbnail", "Generate candidates", `${gen.status} ${genBody.error || JSON.stringify(genBody).slice(0, 160)}`);
    }
  }

  // --- Module 05 Edit ---
  {
    const load = await json(`/api/projects/${PROJECT}/edit`);
    if (load.status === 200 && load.body.timeline) {
      ok("05 Edit", "Load timeline", `scenes=${(load.body.timeline.scenes || []).length}`);
    } else {
      fail("05 Edit", "Load timeline", `${load.status} ${load.body?.error || ""}`);
    }

    if (load.body?.timeline) {
      const timeline = {
        ...load.body.timeline,
        music: {
          source: "bundled",
          url: "/music/ambient-focus.mp3",
          name: "Ambient Focus",
          volume: 0.4,
        },
        effects: {
          brightness: 10,
          contrast: 15,
          gamma: 1.1,
          quickStyle: "warm",
        },
      };
      const save = await json(`/api/projects/${PROJECT}/timeline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeline }),
      });
      if (save.status === 200 && save.body.timeline?.music?.name === "Ambient Focus") {
        ok("05 Edit", "Save music + effects", `style=${save.body.timeline.effects?.quickStyle}`);
      } else {
        fail("05 Edit", "Save music + effects", `${save.status} ${save.body?.error || ""}`);
      }

      const musicHead = await head("/music/ambient-focus.mp3");
      if (musicHead.status === 200) {
        ok("05 Edit", "Bundled music file serves", "ambient-focus.mp3");
      } else {
        fail("05 Edit", "Bundled music file serves", `HEAD ${musicHead.status}`);
      }
    }

    // Tiny JPEG upload for image add
    const jpeg = Buffer.from(
      "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z",
      "base64"
    );
    const imgForm = new FormData();
    imgForm.append("file", new Blob([jpeg], { type: "image/jpeg" }), "test-still.jpg");
    const img = await fetch(`${BASE}/api/projects/${PROJECT}/timeline/image`, {
      method: "POST",
      body: imgForm,
    });
    const imgBody = await img.json().catch(() => ({}));
    if (img.status === 200 && imgBody.image?.url) {
      ok("05 Edit", "Upload timeline image", imgBody.image.title || "ok");
    } else {
      fail("05 Edit", "Upload timeline image", `${img.status} ${imgBody.error || ""}`);
    }
  }

  // --- Module 06 Export ---
  {
    const load = await json(`/api/projects/${PROJECT}/export`);
    if (load.status === 200) {
      ok("06 Export", "Load export page", load.body.pipeline ? "pipeline ok" : "ok");
    } else {
      fail("06 Export", "Load export page", `${load.status} ${load.body?.error || ""}`);
    }

    const start = await json(`/api/projects/${PROJECT}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aspectRatio: "16:9" }),
    });
    if (start.status === 200 && start.body?.jobId) {
      let latest = start.body;
      for (let i = 0; i < 60; i++) {
        const poll = await json(`/api/jobs/${start.body.jobId}`);
        latest = poll.body;
        if (latest.status === "completed" || latest.status === "failed") break;
        await new Promise((r) => setTimeout(r, 3000));
      }
      const out = latest.outputUrl || latest.exportJob?.output_url;
      if (latest.status === "completed" && out) {
        const media = await head(out.startsWith("http") ? out.replace(BASE, "") : out);
        ok("06 Export", "Render MP4", `output HEAD=${media.status}`);
      } else {
        fail("06 Export", "Render MP4", `${latest.status} ${latest.error || ""} out=${out || "none"}`);
      }
    } else {
      fail("06 Export", "Render MP4", `${start.status} ${start.body?.error || JSON.stringify(start.body).slice(0, 160)}`);
    }
  }

  // --- Pipeline ---
  {
    const pipe = await json(`/api/projects/${PROJECT}/pipeline`);
    if (pipe.status === 200 && pipe.body.pipeline) {
      ok("Pipeline", "Status endpoint", JSON.stringify(pipe.body.pipeline).slice(0, 120));
    } else {
      fail("Pipeline", "Status endpoint", `${pipe.status}`);
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n——— Summary: ${passed} passed, ${failed} failed of ${results.length} ——–\n`);
  if (failed) {
    for (const r of results.filter((x) => !x.pass)) {
      console.log(`  • ${r.module} / ${r.option}: ${r.detail}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
