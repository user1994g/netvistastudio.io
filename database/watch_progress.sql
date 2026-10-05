-- Supabase migration: netvista_watch_progress. Two small rows at most per
-- account for the current catalogue; no IPs, devices or event-by-event logs.
create table public.watch_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  film_id text not null check (film_id in ('dark-echoes-1939', 'final-lesson-ap-1')),
  position_seconds double precision not null default 0 check (position_seconds between 0 and 86400),
  duration_seconds double precision not null default 0 check (duration_seconds between 0 and 86400),
  completed boolean not null default false,
  saved boolean not null default false,
  last_watched_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, film_id),
  check (duration_seconds = 0 or position_seconds <= duration_seconds)
);
alter table public.watch_progress enable row level security;
revoke all on public.watch_progress from anon, authenticated;
grant select, delete on public.watch_progress to authenticated;
grant insert (user_id, film_id, position_seconds, duration_seconds, completed, saved, last_watched_at),
      update (user_id, film_id, position_seconds, duration_seconds, completed, saved, last_watched_at)
      on public.watch_progress to authenticated;
create policy watch_progress_select on public.watch_progress for select to authenticated
  using ((select auth.uid()) = user_id);
create policy watch_progress_insert on public.watch_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy watch_progress_update on public.watch_progress for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy watch_progress_delete on public.watch_progress for delete to authenticated
  using ((select auth.uid()) = user_id);
create function public.watch_progress_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.watch_progress_updated_at() from public, anon, authenticated;
create trigger watch_progress_touch before update on public.watch_progress
  for each row execute function public.watch_progress_updated_at();
