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

Vercel serverless is a poor fit for Remotion/ffmpeg export. Prefer a persistent Node host (Railway, Render, Fly.io, or a VPS).
