-- Storage bucket for timeline-related uploads (background music)

insert into storage.buckets (id, name, public)
values ('timeline', 'timeline', true)
on conflict (id) do nothing;

create policy "Timeline files are public"
  on storage.objects for select
  using (bucket_id = 'timeline');

create policy "Users upload timeline files to own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'timeline'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users update own timeline files"
  on storage.objects for update
  using (
    bucket_id = 'timeline'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users delete own timeline files"
  on storage.objects for delete
  using (
    bucket_id = 'timeline'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
