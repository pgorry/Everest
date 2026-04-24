-- ============================================================
-- Everest Challenge — database setup
-- Run this once in Supabase SQL Editor (paste the whole file, execute).
-- ============================================================

create extension if not exists pgcrypto;

-- ---- climbers: one row per user, auto-created on signup ----
create table if not exists public.climbers (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  color text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.climbers enable row level security;

drop policy if exists "climbers_select_auth" on public.climbers;
create policy "climbers_select_auth"
  on public.climbers for select
  to authenticated
  using (true);

-- Trigger: populate climbers on new auth user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.climbers (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill any existing auth users (no-op if climbers already exist)
insert into public.climbers (id, email)
select u.id, u.email from auth.users u
where not exists (select 1 from public.climbers c where c.id = u.id);

-- ---- hikes ----
create table if not exists public.hikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  gain_m integer not null check (gain_m > 0),
  hiked_on date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists hikes_user_id_idx on public.hikes(user_id);
create index if not exists hikes_lower_name_gain_idx on public.hikes(lower(name), gain_m);

alter table public.hikes enable row level security;

drop policy if exists "hikes_select_auth" on public.hikes;
create policy "hikes_select_auth"
  on public.hikes for select
  to authenticated
  using (true);

drop policy if exists "hikes_insert_own" on public.hikes;
create policy "hikes_insert_own"
  on public.hikes for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "hikes_delete_own_or_admin" on public.hikes;
create policy "hikes_delete_own_or_admin"
  on public.hikes for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.climbers where id = auth.uid() and is_admin)
  );

-- ============================================================
-- After your first login, make yourself admin:
--   update public.climbers set is_admin = true where email = 'pgorry@gmail.com';
-- ============================================================
