-- JARVIS chat storage.
--
-- Written only by the portfolio backend with the Supabase secret key, which
-- bypasses row-level security. RLS is enabled with no policies, so the
-- publishable (anon) key can neither read nor write these tables.

create table if not exists public.chat_conversations (
  id          uuid primary key,              -- minted by the visitor's browser
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  page        text,                          -- path the chat was opened on
  user_agent  text
);

create table if not exists public.chat_messages (
  id               bigint generated always as identity primary key,
  conversation_id  uuid not null references public.chat_conversations (id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null,
  voice            boolean not null default false,
  created_at       timestamptz not null default now()
);

create index if not exists chat_messages_conversation_idx
  on public.chat_messages (conversation_id, id);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
