# Deployment

ReelForge AI runs as a single Next.js app with a **local on-disk store** (`.data/`). There is no hosted database and no sign-in.

## Architecture

| Service | Role |
|---------|------|
| Next.js app | Studio UI, APIs, script/visuals/voice/thumbnail/export jobs |
| Local store | Projects, job queue, and media files under `.data/` |

Long-running steps (script, visuals, voice, thumbnails, export) run in the Next.js process via `/api/jobs/[id]` polling from the browser.

## Environment variables

Copy `.env.example` → `.env.local` for local dev. Production needs at minimum:

```env
LLM_API_KEY=
LLM_API_BASE_URL=
LLM_MODEL=
TTS_PROVIDER=sapi
NEXT_PUBLIC_SITE_URL=https://your-domain.example
```

Add Visuals keys from `.env.example` as needed. Image/Motion still work without paid image APIs (Pollinations).

## Deploy the Next.js app

1. Host on a Node server with enough CPU/RAM for ffmpeg and Remotion (export is heavy).
2. Add env vars from `.env.example`.
3. Persist the `.data/` directory across deploys so projects and media survive restarts.
4. Build and start:

```bash
npm run build
npm run start
```

**Note:** Paths containing apostrophes (e.g. `Youtuber's Bible`) break some Windows shells. Use `subst` locally or rename the folder for CI.

## Vercel notes

Vercel **serverless** has limits this studio hits:

| Area | Behavior on Vercel |
|------|--------------------|
| Script | Works (jobs complete inside the POST) |
| Visuals stills | Works when image APIs/Pollinations respond; soft-completes without ffmpeg |
| Visuals MP4 | Needs `ffmpeg-static` in the function bundle; otherwise stills-only |
| Voice | Edge TTS → Google Translate TTS (no Windows SAPI); finishes in POST |
| Export / Remotion | Often too heavy — prefer a Node host |

Set env vars in the Vercel project (Gemini, Cloudflare, LLM, etc.).

**Demo store durability (required on Vercel):** `/tmp` is not shared across instances.

Connect a **Vercel Blob** store to the project (Storage → Blob). Vercel injects `BLOB_READ_WRITE_TOKEN` automatically. The app then persists projects, jobs, and media to Blob so every serverless instance sees the same state.

Optional alternative: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.

Without a durable store, mutating APIs may still return completed results in the POST body, but a later request on another instance can miss prior jobs/media.

For a fully reliable pipeline (voice + ffmpeg export), deploy to a persistent Node host (Railway, Render, Fly.io, or a VPS) with `npm run build && npm run start`.
