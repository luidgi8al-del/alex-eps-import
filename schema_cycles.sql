-- Cycles d'enseignement, partages entre le site et l'application.
-- class_id est NULLABLE a dessein : on doit pouvoir preparer et consulter un cycle sans avoir
-- cree de classe (exploration, preparation d'annee).
-- A executer dans l'editeur SQL de Supabase, APRES schema_sync.sql.

create table if not exists cycles (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id text references classes(id) on delete set null,
  grade text not null,
  apsa_name text not null,
  session_count int not null check (session_count between 1 and 20),
  school_year text not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index if not exists idx_cycles_user_id on cycles(user_id);
create index if not exists idx_cycles_class_id on cycles(class_id);

alter table cycles enable row level security;

drop policy if exists "select own cycles" on cycles;
drop policy if exists "insert own cycles" on cycles;
drop policy if exists "update own cycles" on cycles;
drop policy if exists "delete own cycles" on cycles;
create policy "select own cycles" on cycles for select using (auth.uid() = user_id);
create policy "insert own cycles" on cycles for insert with check (auth.uid() = user_id);
create policy "update own cycles" on cycles for update using (auth.uid() = user_id);
create policy "delete own cycles" on cycles for delete using (auth.uid() = user_id);
