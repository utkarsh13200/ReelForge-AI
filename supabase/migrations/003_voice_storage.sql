-- Voice assets metadata + storage bucket for generated audio

alter table public.voice_assets
  add column if not exists word_timestamps_json jsonb;

insert into storage.buckets (id, name, public)
values ('voice', 'voice', true)
on conflict (id) do nothing;

create policy "Voice files are public"
  on storage.objects for select
  using (bucket_id = 'voice');

create policy "Users upload voice files to own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'voice'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users update own voice files"
  on storage.objects for update
  using (
    bucket_id = 'voice'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users delete own voice files"
  on storage.objects for delete
  using (
    bucket_id = 'voice'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
