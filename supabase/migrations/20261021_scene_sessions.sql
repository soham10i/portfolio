-- SceneLab saved analyses.
--
-- Text only: no frame, thumbnail or video is ever stored. Written and read
-- only by the portfolio backend with the secret key; RLS is on with no
-- policies, so the publishable (anon) key has no access at all.

create table if not exists public.scene_sessions (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null,                 -- random id the visitor's browser keeps
  created_at      timestamptz not null default now(),
  title           text not null,
  source          text not null check (source in ('camera', 'file')),
  duration_sec    double precision,
  scenario        text,
  summary         text,
  object_counts   jsonb not null default '{}'::jsonb,
  keyframe_count  integer not null default 0
);
create index if not exists scene_sessions_client_idx on public.scene_sessions (client_id, created_at desc);

create table if not exists public.scene_keyframes (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references public.scene_sessions (id) on delete cascade,
  seq         integer not null,
  t           double precision not null,         -- seconds into the source
  labels      text[] not null default '{}',
  caption     text,
  engine      text check (engine in ('blip', 'vlm', 'local')),
  confidence  double precision
);
create index if not exists scene_keyframes_session_idx on public.scene_keyframes (session_id, seq);

create table if not exists public.scene_qa (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references public.scene_sessions (id) on delete cascade,
  seq         integer not null,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null
);
create index if not exists scene_qa_session_idx on public.scene_qa (session_id, seq);

alter table public.scene_sessions  enable row level security;
alter table public.scene_keyframes enable row level security;
alter table public.scene_qa        enable row level security;
