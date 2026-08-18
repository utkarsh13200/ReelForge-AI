alter table public.projects
  add column if not exists visual_video_url text,
  add column if not exists visual_video_duration_seconds numeric;

alter table public.visual_assets
  add column if not exists scene_beat text;
