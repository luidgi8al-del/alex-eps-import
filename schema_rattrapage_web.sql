-- Rattrapage fonctionnel du site : équipes sauvegardées et archivage des documents.
-- Script idempotent à exécuter dans l'éditeur SQL Supabase.
begin;

create table if not exists public.saved_teams (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id text not null references public.classes(id) on delete cascade,
  name text not null default '',
  mode text not null default 'ALEATOIRE',
  period_number int not null default 1,
  activity_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.saved_team_members (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  saved_team_id text not null references public.saved_teams(id) on delete cascade,
  student_id text not null references public.students(id) on delete cascade,
  team_index int not null default 0,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.team_evaluations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  saved_team_id text not null references public.saved_teams(id) on delete cascade,
  class_id text not null references public.classes(id) on delete cascade,
  title text not null default '',
  criteria_json jsonb not null default '[]'::jsonb,
  scores_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create unique index if not exists uq_saved_team_member
  on public.saved_team_members(saved_team_id, student_id) where deleted = false;
create index if not exists idx_saved_teams_class on public.saved_teams(class_id) where deleted = false;
create index if not exists idx_saved_team_members_team on public.saved_team_members(saved_team_id) where deleted = false;
create index if not exists idx_team_evaluations_team on public.team_evaluations(saved_team_id) where deleted = false;

alter table public.saved_teams enable row level security;
alter table public.saved_team_members enable row level security;
alter table public.team_evaluations enable row level security;

do $$ declare t text; begin
  foreach t in array array['saved_teams','saved_team_members','team_evaluations'] loop
    execute format('drop policy if exists eps_read on public.%I', t);
    execute format('drop policy if exists eps_insert on public.%I', t);
    execute format('drop policy if exists eps_update on public.%I', t);
    execute format('drop policy if exists eps_delete on public.%I', t);
    execute format('create policy eps_read on public.%I for select to authenticated using (user_id = auth.uid() and eps_account_active())', t);
    execute format('create policy eps_insert on public.%I for insert to authenticated with check (user_id = auth.uid() and eps_account_active())', t);
    execute format('create policy eps_update on public.%I for update to authenticated using (user_id = auth.uid() and eps_account_active()) with check (user_id = auth.uid() and eps_account_active())', t);
    execute format('create policy eps_delete on public.%I for delete to authenticated using (user_id = auth.uid() and eps_account_active())', t);
    execute format('grant select,insert,update,delete on public.%I to authenticated', t);
  end loop;
end $$;

alter table public.class_documents add column if not exists archived boolean not null default false;
alter table public.class_documents add column if not exists archived_at timestamptz;

commit;
