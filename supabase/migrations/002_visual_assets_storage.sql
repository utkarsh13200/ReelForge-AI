-- Visual assets metadata + storage bucket for generated images

alter table public.visual_assets
  add column if not exists scene_title text,
  add column if not exists mode text not null default 'image' check (mode in ('image', 'motion'));

insert into storage.buckets (id, name, public)
values ('visuals', 'visuals', true)
on conflict (id) do nothing;

create policy "Visual files are public"
  on storage.objects for select
  using (bucket_id = 'visuals');

create policy "Users upload visuals to own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'visuals'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users update own visual files"
  on storage.objects for update
  using (
    bucket_id = 'visuals'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users delete own visual files"
  on storage.objects for delete
  using (
    bucket_id = 'visuals'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
