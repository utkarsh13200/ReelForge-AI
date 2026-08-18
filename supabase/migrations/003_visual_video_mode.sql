-- Allow video mode on visual assets
alter table public.visual_assets drop constraint if exists visual_assets_mode_check;
alter table public.visual_assets
  add constraint visual_assets_mode_check check (mode in ('image', 'motion', 'video'));
