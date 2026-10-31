-- Tabella dedicata alle stanze della Scopa Telegram.
-- Eseguire una sola volta nel SQL Editor del progetto Supabase Scopa-Dany.
create extension if not exists pgcrypto;

create table if not exists public.scopa_telegram_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  group_chat_id bigint,
  status text not null default 'waiting'
    check (status in ('waiting','playing','finished')),
  player1_telegram_id bigint,
  player1_name text,
  player2_telegram_id bigint,
  player2_name text,
  state jsonb not null default '{}'::jsonb,
  chat jsonb not null default '[]'::jsonb,
  winner_telegram_id bigint,
  result_message text,
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint scopa_telegram_distinct_players check (
    player1_telegram_id is null or player2_telegram_id is null
    or player1_telegram_id <> player2_telegram_id
  )
);

create index if not exists scopa_telegram_rooms_status_created_idx
  on public.scopa_telegram_rooms (status, created_at desc);

alter table public.scopa_telegram_rooms enable row level security;

-- Nessun accesso diretto da client anon/authenticated: l'Edge Function usa
-- esclusivamente la SERVICE_ROLE_KEY, che bypassa RLS.
revoke all on table public.scopa_telegram_rooms from anon, authenticated;
grant all on table public.scopa_telegram_rooms to service_role;
