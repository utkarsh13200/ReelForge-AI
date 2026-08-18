insert into storage.buckets (id, name, public)
values ('exports', 'exports', true)
on conflict (id) do nothing;

create policy "Export files are public"
  on storage.objects for select
  using (bucket_id = 'exports');

create policy "Users upload exports to own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'exports'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users update own export files"
  on storage.objects for update
  using (
    bucket_id = 'exports'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users delete own export files"
  on storage.objects for delete
  using (
    bucket_id = 'exports'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
