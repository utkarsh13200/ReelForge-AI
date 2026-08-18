# Deployment

ReelForge AI is designed to split **web UI** (Vercel or any Node host) from **export rendering** (CPU-heavy Remotion worker).

## Architecture

| Service | Role | Suggested host |
|---------|------|----------------|
| Next.js app | Auth, dashboard, APIs, light jobs | Vercel, Netlify, self-hosted Node |
| Export worker | Remotion MP4 renders | Railway, Render, Fly.io, local dev |
| Supabase | Postgres, auth, storage | Supabase Cloud |

Long-running steps (script, visuals, voice, thumbnails) run via `/api/jobs/[id]` polling from the browser. **Export renders** should run on the worker in production.

## 1. Supabase setup

Run migrations in order in the SQL editor:

1. `supabase/migrations/001_initial.sql`
2. `supabase/migrations/002_visual_assets_storage.sql`
3. `supabase/migrations/003_voice_storage.sql`
4. `supabase/migrations/004_thumbnail_storage.sql`
5. `supabase/migrations/005_timeline_storage.sql`
6. `supabase/migrations/006_export_storage.sql`

Enable Google OAuth under Authentication → Providers if you use Google sign-in.

Create storage buckets are created by migrations (`visuals`, `voice`, `thumbnails`, `timeline`, `exports`).

## 2. Environment variables

Copy `.env.example` → `.env.local` for local dev. Production needs at minimum:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

LLM_API_KEY=
LLM_API_BASE_URL=
LLM_MODEL=

TTS_PROVIDER=edge-tts
```

Optional:

```env
EXPORT_WORKER_MODE=true   # on web app — defer export_render to worker
EXPORT_WORKER_POLL_MS=4000
```

## 3. Deploy the Next.js app (Vercel example)

1. Connect the Git repo to Vercel.
2. Set root directory to the project folder.
3. Add all env vars from `.env.example`.
4. Set `EXPORT_WORKER_MODE=true` so Vercel does **not** attempt Remotion renders (they will timeout).
5. Deploy.

**Note:** Paths containing apostrophes (e.g. `Youtuber's Bible`) break some Windows shells. Use `subst` locally or rename the folder for CI.

## 4. Deploy the export worker

The worker polls `job_queue` for `export_render` jobs and runs Remotion server-side.

### Railway / Render / Fly.io

1. Use the same repo and env vars as the web app (especially `SUPABASE_SERVICE_ROLE_KEY`).
2. **Start command:** `npm run export:worker`
3. **Resources:** at least 2 GB RAM, 2 vCPU recommended for 1080p renders.
4. Do **not** set `EXPORT_WORKER_MODE` on the worker itself.

### Local two-process dev

Terminal 1 — web app with worker mode:

```powershell
subst Y: "C:\Users\Utkarsh\Documents\Youtuber's Bible"
$env:EXPORT_WORKER_MODE="true"
npm run dev --prefix Y:\
```

Terminal 2 — export worker:

```powershell
npm run export:worker --prefix Y:\
```

Without worker mode, exports still work locally via browser polling (single `npm run dev`).

## 5. Smoke test checklist

1. Sign in → `/dashboard/script` → generate script (`LLM_API_KEY` required).
2. Visuals → split scenes → generate images (LLM for split; Pollinations for images).
3. Voice → generate voiceover (edge-tts; ffmpeg-static for concat).
4. Thumbnail → generate candidates → save with text overlay.
5. Edit → adjust timeline → save.
6. Export → pick 16:9 / 9:16 / 1:1 → render → download MP4.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Export stuck at 0% with worker mode | Ensure `npm run export:worker` is running |
| `LLM_API_KEY is not configured` | Add key to `.env.local`; restart dev server |
| Voice concat fails | Approve ffmpeg-static install: `npm approve-scripts ffmpeg-static` |
| Storage upload fails | Set `SUPABASE_SERVICE_ROLE_KEY` and run storage migrations |
| Port 3000 in use (Eon VPN) | Dev is pinned to **3001** — use `http://localhost:3001` |
| Remotion bundle slow first time | Normal; bundle is cached in worker memory |

## Licensing

Remotion has license terms based on company size — review [remotion.dev/license](https://www.remotion.dev/docs/license) before commercial shipping.
