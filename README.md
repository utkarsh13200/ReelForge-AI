# ReelForge AI

Turn a topic or YouTube video into a fully produced short/long-form video: **script → visuals → voiceover → thumbnail → edit → export**.

## Stack

- **Next.js 14** (App Router), TypeScript, Tailwind CSS, shadcn/ui, TanStack Query
- **Supabase** — auth, Postgres, storage
- **Pollinations.ai** — free scene/thumbnail images (no API key)
- **edge-tts** — free neural TTS (no API key)
- **Remotion** — programmatic MP4 export with captions + Ken Burns motion
- **ffmpeg-static** — voice concat + Remotion encoding

## Quick start (Windows)

The folder name `Youtuber's Bible` breaks some shells. Use a subst drive:

```powershell
subst Y: "C:\Users\Utkarsh\Documents\Youtuber's Bible"
cd Y:\
npm run setup          # install, approve scripts, create .env.local
# Edit .env.local with Supabase + LLM keys, then:
# Supabase SQL Editor -> paste supabase/apply-all-migrations.sql -> Run
npm run dev            # starts on port 3001 and opens the browser
```

**App URL:** [http://localhost:3001/login](http://localhost:3001/login)

Port **3001** is fixed (Eon VPN often occupies 3000 on Windows). Opening this project in Cursor also auto-starts the dev server in the background.

## Environment (`.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # recommended for storage uploads

LLM_API_KEY=                      # script, scene split (required for Module 1–2)
LLM_API_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.3-70b-versatile

TTS_PROVIDER=edge-tts
```

See `.env.example` for all variables.

## Database migrations

Run in the Supabase SQL editor **in order**, or paste the combined file once:

**Recommended:** `supabase/apply-all-migrations.sql` (all 001–006 in one shot)

| File | Adds |
|------|------|
| `001_initial.sql` | Core tables, RLS, job queue |
| `002_visual_assets_storage.sql` | Visuals bucket + scene metadata |
| `003_voice_storage.sql` | Voice bucket + word timestamps |
| `004_thumbnail_storage.sql` | Thumbnails bucket + overlay JSON |
| `005_timeline_storage.sql` | Timeline/music bucket |
| `006_export_storage.sql` | Exports bucket |

## Studio modules

| # | Route | What it does |
|---|-------|--------------|
| 1 | `/dashboard/script` | Topic or YouTube URL → long-form script (chunked LLM) |
| 2 | `/dashboard/visuals` | Scene split + Pollinations images + motion mode |
| 3 | `/dashboard/voice` | edge-tts voiceover + word timestamps |
| 4 | `/dashboard/thumbnail` | 4 AI candidates + canvas text editor |
| 5 | `/dashboard/edit` | Timeline, captions, music → `timeline_json` |
| 6 | `/dashboard/export` | Remotion MP4 (16:9 / 9:16 / 1:1) |

The dashboard header shows **pipeline progress** across all six steps.

## Export worker (production)

Remotion renders are CPU-heavy. Do **not** run them on Vercel serverless.

1. Set `EXPORT_WORKER_MODE=true` on the **web app**
2. Run the worker on Railway / Render / Fly.io (or locally):

```bash
npm run export:worker
```

Full deployment guide: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run export:worker` | Background Remotion export processor |

## Architecture notes

- Long jobs use `job_queue` + polling via `GET /api/jobs/[id]` (one step per request)
- Provider adapters live under `lib/providers/` for easy swapping
- Motion scenes use Ken Burns pan/zoom at export (`lib/video-gen.ts`, `remotion/ReelForgeVideo.tsx`)
- Thumbnail prompts fall back to heuristics when `LLM_API_KEY` is unset

## Build status

All six modules are implemented end-to-end. ✅
