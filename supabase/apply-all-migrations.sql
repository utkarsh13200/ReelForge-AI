-- ReelForge AI — apply all migrations (001–006) in one shot
-- Supabase Dashboard -> SQL Editor -> paste this entire file -> Run
-- Run once on a fresh project. Re-running storage policies may show "already exists" errors (safe to ignore).

-- ReelForge AI initial schema
-- Run in Supabase SQL editor or via supabase db push

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  plan text not null default 'free',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Profiles are updatable by owner"
  on public.profiles for update
  using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Untitled project',
  script text,
  script_word_count int,
  source_type text check (source_type in ('topic', 'youtube_url')),
  source_url text,
  timeline_json jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "Projects are accessible by owner"
  on public.projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.visual_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  type text not null check (type in ('image', 'video')),
  prompt text,
  url text,
  scene_index int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.visual_assets enable row level security;

create policy "Visual assets follow project ownership"
  on public.visual_assets for all
  using (exists (
    select 1 from public.projects p
    where p.id = project_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.projects p
    where p.id = project_id and p.user_id = auth.uid()
  ));

create table if not exists public.voice_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  audio_url text,
  voice_id text,
  duration_seconds numeric,
  created_at timestamptz not null default now()
);

alter table public.voice_assets enable row level security;

create policy "Voice assets follow project ownership"
  on public.voice_assets for all
  using (exists (
    select 1 from public.projects p
    where p.id = project_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.projects p
    where p.id = project_id and p.user_id = auth.uid()
  ));

create table if not exists public.thumbnails (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  url text,
  prompt text,
  created_at timestamptz not null default now()
);

alter table public.thumbnails enable row level security;

create policy "Thumbnails follow project ownership"
  on public.thumbnails for all
  using (exists (
    select 1 from public.projects p
    where p.id = project_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.projects p
    where p.id = project_id and p.user_id = auth.uid()
  ));

create table if not exists public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  status text not null default 'queued',
  progress int not null default 0,
  output_url text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.export_jobs enable row level security;

create policy "Export jobs follow project ownership"
  on public.export_jobs for all
  using (exists (
    select 1 from public.projects p
    where p.id = project_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.projects p
    where p.id = project_id and p.user_id = auth.uid()
  ));

create table if not exists public.job_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  status text not null default 'queued',
  progress int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.job_queue enable row level security;

create policy "Job queue accessible by owner"
  on public.job_queue for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
-- Visual assets metadata + storage bucket for generated images

alter table public.visual_assets
  add column if not exists scene_title text,
  add column if not exists mode text not null default 'image' check (mode in ('image', 'motion', 'video'));

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
-- Visual preview video + scene beat metadata

alter table public.projects
  add column if not exists visual_video_url text,
  add column if not exists visual_video_duration_seconds numeric;

alter table public.visual_assets
  add column if not exists scene_beat text;


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
