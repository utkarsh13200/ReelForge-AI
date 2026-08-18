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
