# Creator's Bible

An original-content-first YouTube production studio. The current build delivers an interactive front-end prototype for the complete project flow:

- project dashboard and guided production stages
- editable script, scene prompts, voice/language selection, and thumbnail choices
- scene-level visual regeneration feedback
- advisory compliance report with visible issue-by-issue fixes
- export queue with local progress state
- provider adapter contracts (`lib/provider-adapters.ts`) for script, image, video, and TTS integrations

## Run locally

```bash
pnpm install
pnpm dev
```

Then open `http://localhost:3000`.

## Production wiring next

Connect the provider adapters to API routes, store project data in Prisma/Postgres, and send slow visual/voice/render tasks to BullMQ. The UI intentionally marks the policy pass as advisory and keeps all suggested fixes visible to the creator.

`prisma/schema.prisma` includes the complete project, scene, asset, voiceover, thumbnail, report, render-job, and usage data model. `POST /api/compliance` is a deterministic, transparent starter check; a provider-based review can be added after it, but should never conceal the original finding or auto-apply changes.
