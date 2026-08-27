-- Execute este arquivo no Supabase: SQL Editor > New query > Run
create table if not exists public.project_entries (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('updates', 'docs')),
  name text not null,
  ra text not null,
  description text not null,
  status text not null default 'working' check (status in ('working', 'broken', 'documented')),
  image text not null,
  created_at timestamptz not null default now()
);

alter table public.project_entries enable row level security;

drop policy if exists "project entries read" on public.project_entries;
drop policy if exists "project entries insert" on public.project_entries;
drop policy if exists "project entries delete" on public.project_entries;

create policy "project entries read" on public.project_entries for select to anon using (true);
create policy "project entries insert" on public.project_entries for insert to anon with check (true);
create policy "project entries delete" on public.project_entries for delete to anon using (true);

grant select, insert, delete on public.project_entries to anon;
