# ComfyUI workflows for ReelForge

Export your ComfyUI graph in **API format** (Settings → Enable Dev mode → Save API Format).

## Text-to-video

1. Copy `comfyui-t2v.example.api.json` to `comfyui-t2v.api.json`
2. Replace checkpoint / video nodes with your installed T2V workflow
3. Keep `{{PROMPT}}` and `{{NEGATIVE}}` in CLIPTextEncode nodes (or use standard positive/negative nodes — the app patches the first two CLIP encoders)
4. Set in `.env.local`:

```
COMFYUI_BASE_URL=http://127.0.0.1:8188
COMFYUI_T2V_WORKFLOW=workflows/comfyui-t2v.api.json
```

## Image-to-video (optional, faster fallback)

1. Export your img2vid workflow (SVD, AnimateDiff, Wan, etc.) to `comfyui-i2v.api.json`
2. Ensure it has a `LoadImage` node — the app uploads Gemini scene stills before running I2V

```
COMFYUI_I2V_WORKFLOW=workflows/comfyui-i2v.api.json
```

When I2V is configured, Video mode tries: Gemini still → ComfyUI I2V → ComfyUI T2V → Ken Burns fallback.
