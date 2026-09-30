# ReelForge AI

Turn a topic or YouTube video into a fully produced video: **script → visuals → voiceover → thumbnail → edit → export**.

No sign-up or login. Projects and media are stored locally in `.data/`.

## Stack

- **Next.js 14** (App Router), TypeScript, Tailwind CSS, shadcn/ui, TanStack Query
- **Local store** — projects, jobs, and media on disk (no hosted database)
- **Pollinations.ai** — free scene/thumbnail images (no API key)
- **edge-tts / Windows SAPI** — voiceover
- **Remotion** — programmatic MP4 export with captions + Ken Burns motion
- **ffmpeg-static** — voice concat + encoding

## Quick start (Windows)

The folder name `Youtuber's Bible` breaks some shells. Use a subst drive:

```powershell
subst Y: "C:\Users\Utkarsh\Documents\Youtuber's Bible"
cd Y:\
npm run setup          # install, approve scripts, create .env.local
# Edit .env.local with LLM + Visuals API keys, then:
npm run dev            # starts on port 3001
```

**App URL:** [http://localhost:3001](http://localhost:3001)

Port **3001** is fixed (Eon VPN often occupies 3000 on Windows).

## Environment (`.env.local`)

```env
LLM_API_KEY=                      # script, scene split
LLM_API_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.3-70b-versatile

TTS_PROVIDER=sapi
```

See `.env.example` for Visuals provider keys (Gemini, Hugging Face, Fal, Replicate, JSON2Video). Image/Motion still work with Pollinations if paid keys are unavailable.

## Studio modules

| # | Route | What it does |
|---|-------|--------------|
| 1 | `/dashboard/script` | Topic or YouTube URL → long-form script |
| 2 | `/dashboard/visuals` | Scene split + AI images + motion mode |
| 3 | `/dashboard/voice` | Voiceover + word timestamps |
| 4 | `/dashboard/thumbnail` | AI candidates + canvas text editor |
| 5 | `/dashboard/edit` | Timeline, captions, music |
| 6 | `/dashboard/export` | Remotion MP4 (16:9 / 9:16 / 1:1) |

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Production server (port 3001) |
| `npm run lint` | ESLint |
| `npm run check:providers` | Probe Visuals image/video API keys |
