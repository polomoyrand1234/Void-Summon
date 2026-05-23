-- VOID SUMMON V3 — SUPABASE SCHEMA
-- Copier-coller dans Supabase > SQL Editor > New query > Run
create table if not exists public.void_summon_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  inventory jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  player_level integer not null default 1,
  player_xp integer not null default 0,
  player_title text not null default 'Éveilleur débutant',
  fragments integer not null default 0,
  pity jsonb not null default '{"epic":0,"legendary":0,"mythic":0}'::jsonb,
  daily_quests jsonb not null default '{}'::jsonb,
  unlocked_titles jsonb not null default '["Éveilleur débutant"]'::jsonb,
  save_data jsonb not null default '{}'::jsonb,
  app_version text not null default 'v3',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.void_summon_profiles add column if not exists inventory jsonb not null default '{}'::jsonb;
alter table public.void_summon_profiles add column if not exists stats jsonb not null default '{}'::jsonb;
alter table public.void_summon_profiles add column if not exists player_level integer not null default 1;
alter table public.void_summon_profiles add column if not exists player_xp integer not null default 0;
alter table public.void_summon_profiles add column if not exists player_title text not null default 'Éveilleur débutant';
alter table public.void_summon_profiles add column if not exists fragments integer not null default 0;
alter table public.void_summon_profiles add column if not exists pity jsonb not null default '{"epic":0,"legendary":0,"mythic":0}'::jsonb;
alter table public.void_summon_profiles add column if not exists daily_quests jsonb not null default '{}'::jsonb;
alter table public.void_summon_profiles add column if not exists unlocked_titles jsonb not null default '["Éveilleur débutant"]'::jsonb;
alter table public.void_summon_profiles add column if not exists save_data jsonb not null default '{}'::jsonb;
alter table public.void_summon_profiles add column if not exists app_version text not null default 'v3';
alter table public.void_summon_profiles add column if not exists created_at timestamptz not null default now();
alter table public.void_summon_profiles add column if not exists updated_at timestamptz not null default now();
alter table public.void_summon_profiles enable row level security;
drop policy if exists "Void Summon read own profile" on public.void_summon_profiles;
drop policy if exists "Void Summon insert own profile" on public.void_summon_profiles;
drop policy if exists "Void Summon update own profile" on public.void_summon_profiles;
drop policy if exists "Void Summon delete own profile" on public.void_summon_profiles;
create policy "Void Summon read own profile" on public.void_summon_profiles for select to authenticated using (auth.uid() = user_id);
create policy "Void Summon insert own profile" on public.void_summon_profiles for insert to authenticated with check (auth.uid() = user_id);
create policy "Void Summon update own profile" on public.void_summon_profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Void Summon delete own profile" on public.void_summon_profiles for delete to authenticated using (auth.uid() = user_id);
create or replace function public.set_void_summon_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_void_summon_updated_at on public.void_summon_profiles;
create trigger trg_void_summon_updated_at before update on public.void_summon_profiles for each row execute function public.set_void_summon_updated_at();
