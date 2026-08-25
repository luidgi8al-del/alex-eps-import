-- ============================================================================
-- Alex EPS Outils — Repertoire UNSS (Eleve LVH / Licencies AS)
-- Script idempotent : peut etre recolle entierement dans le SQL Editor Supabase
-- a chaque evolution. Miroir de UnssStudentEntity cote app Android.
--
-- Contrairement a Planning/Programmation annuelle, ce repertoire est PRIVE au
-- compte (pas de partage entre collegues) : chaque enseignant ne voit que le
-- sien, mais le retrouve sur tous ses appareils (app + site, meme compte).
-- ============================================================================

create table if not exists unss_students (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_name text not null,
  first_name text not null,
  birth_date_epoch_millis bigint,
  category text not null default 'MINIME',
  licensed boolean not null default false,
  wish1 text not null default '',
  wish2 text not null default '',
  wish3 text not null default '',
  student_email text,
  parent_email text,
  jersey_size text not null default '',
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index if not exists idx_unss_students_user_id on unss_students(user_id);

alter table unss_students enable row level security;

drop policy if exists "select own unss students" on unss_students;
drop policy if exists "insert own unss students" on unss_students;
drop policy if exists "update own unss students" on unss_students;
drop policy if exists "delete own unss students" on unss_students;
create policy "select own unss students" on unss_students for select using (auth.uid() = user_id);
create policy "insert own unss students" on unss_students for insert with check (auth.uid() = user_id);
create policy "update own unss students" on unss_students for update using (auth.uid() = user_id);
create policy "delete own unss students" on unss_students for delete using (auth.uid() = user_id);
