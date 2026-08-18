-- Thumbnail metadata + storage bucket for generated images

alter table public.thumbnails
  add column if not exists headline text,
  add column if not exists overlay_json jsonb,
  add column if not exists is_selected boolean not null default false;

insert into storage.buckets (id, name, public)
values ('thumbnails', 'thumbnails', true)
on conflict (id) do nothing;

create policy "Thumbnail files are public"
  on storage.objects for select
  using (bucket_id = 'thumbnails');

create policy "Users upload thumbnails to own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'thumbnails'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users update own thumbnail files"
  on storage.objects for update
  using (
    bucket_id = 'thumbnails'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users delete own thumbnail files"
  on storage.objects for delete
  using (
    bucket_id = 'thumbnails'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
