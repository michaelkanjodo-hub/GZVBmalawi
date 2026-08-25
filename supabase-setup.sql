-- ============================================================
-- Gen Z Volleyball Malawi — Supabase Setup
-- ============================================================
-- How to use:
-- 1. Create a free project at https://supabase.com
-- 2. Go to SQL Editor → New Query
-- 3. Paste this entire file → Run
-- 4. Go to Settings → API → copy your "Project URL" and "anon public" key
-- 5. Paste both into js/supabase-sync.js (SYNC.config)
-- 6. Refresh the site — cross-device sync is live!
-- ============================================================

-- Main sync table (one row per entity: users, players, teams, matches, etc.)
create table if not exists public.gzvm_sync (
  id bigserial primary key,
  entity_type text not null,
  entity_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  unique (entity_type, entity_id)
);

-- Index for fast lookups
create index if not exists gzvm_sync_entity_idx on public.gzvm_sync (entity_type, entity_id);

-- Enable Row Level Security (we keep it permissive for the demo)
alter table public.gzvm_sync enable row level security;

-- Public read/write for the anon key (so the site can read+write without login).
-- In a production app, you would scope writes to authenticated users.
drop policy if exists "anon read all" on public.gzvm_sync;
create policy "anon read all"
  on public.gzvm_sync for select
  to anon, authenticated
  using (true);

drop policy if exists "anon insert all" on public.gzvm_sync;
create policy "anon insert all"
  on public.gzvm_sync for insert
  to anon, authenticated
  with check (true);

drop policy if exists "anon update all" on public.gzvm_sync;
create policy "anon update all"
  on public.gzvm_sync for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "anon delete all" on public.gzvm_sync;
create policy "anon delete all"
  on public.gzvm_sync for delete
  to anon, authenticated
  using (true);

-- Enable realtime
alter publication supabase_realtime add table public.gzvm_sync;

-- ============================================================
-- STORAGE BUCKETS (for profile photos, medical forms, videos)
-- ============================================================
-- Run these statements too (or create buckets manually in the UI)

insert into storage.buckets (id, name, public)
values
  ('profiles', 'profiles', true),
  ('medical', 'medical', true),
  ('highlights', 'highlights', true)
on conflict (id) do nothing;

-- Allow public read on these buckets
drop policy if exists "public read profiles" on storage.objects;
create policy "public read profiles"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id in ('profiles', 'medical', 'highlights'));

drop policy if exists "public write profiles" on storage.objects;
create policy "public write profiles"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id in ('profiles', 'medical', 'highlights'));

drop policy if exists "public update profiles" on storage.objects;
create policy "public update profiles"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id in ('profiles', 'medical', 'highlights'));
