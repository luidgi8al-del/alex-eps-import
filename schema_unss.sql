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

-- ── Groupe (onglet Groupe) : "Escalade" le mercredi 13h-15h, ses inscrits, ses seances/appel ──

create table if not exists unss_groups (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_name text not null,
  day_of_week text not null default '',
  start_time text not null default '',
  end_time text not null default '',
  responsible_teacher text not null default '',
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

-- Inscription d'un eleve (issu du module Classes) a un groupe.
create table if not exists unss_memberships (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id text not null references unss_groups(id) on delete cascade,
  student_id text not null references students(id) on delete cascade,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

-- Une seance d'un groupe, support de l'appel. Jamais supprimee individuellement.
create table if not exists unss_sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id text not null references unss_groups(id) on delete cascade,
  date_epoch_millis bigint not null,
  label text not null default '',
  updated_at timestamptz not null default now()
);

-- Presence d'un eleve a une seance. Jamais supprimee individuellement.
create table if not exists unss_attendance (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null references unss_sessions(id) on delete cascade,
  student_id text not null references students(id) on delete cascade,
  present boolean not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_unss_groups_user_id on unss_groups(user_id);
create index if not exists idx_unss_memberships_user_id on unss_memberships(user_id);
create index if not exists idx_unss_memberships_group_id on unss_memberships(group_id);
create index if not exists idx_unss_sessions_user_id on unss_sessions(user_id);
create index if not exists idx_unss_sessions_group_id on unss_sessions(group_id);
create index if not exists idx_unss_attendance_user_id on unss_attendance(user_id);
create index if not exists idx_unss_attendance_session_id on unss_attendance(session_id);

alter table unss_groups enable row level security;
alter table unss_memberships enable row level security;
alter table unss_sessions enable row level security;
alter table unss_attendance enable row level security;

drop policy if exists "select own unss groups" on unss_groups;
drop policy if exists "insert own unss groups" on unss_groups;
drop policy if exists "update own unss groups" on unss_groups;
drop policy if exists "delete own unss groups" on unss_groups;
create policy "select own unss groups" on unss_groups for select using (auth.uid() = user_id);
create policy "insert own unss groups" on unss_groups for insert with check (auth.uid() = user_id);
create policy "update own unss groups" on unss_groups for update using (auth.uid() = user_id);
create policy "delete own unss groups" on unss_groups for delete using (auth.uid() = user_id);

drop policy if exists "select own unss memberships" on unss_memberships;
drop policy if exists "insert own unss memberships" on unss_memberships;
drop policy if exists "update own unss memberships" on unss_memberships;
drop policy if exists "delete own unss memberships" on unss_memberships;
create policy "select own unss memberships" on unss_memberships for select using (auth.uid() = user_id);
create policy "insert own unss memberships" on unss_memberships for insert with check (auth.uid() = user_id);
create policy "update own unss memberships" on unss_memberships for update using (auth.uid() = user_id);
create policy "delete own unss memberships" on unss_memberships for delete using (auth.uid() = user_id);

drop policy if exists "select own unss sessions" on unss_sessions;
drop policy if exists "insert own unss sessions" on unss_sessions;
drop policy if exists "delete own unss sessions" on unss_sessions;
create policy "select own unss sessions" on unss_sessions for select using (auth.uid() = user_id);
create policy "insert own unss sessions" on unss_sessions for insert with check (auth.uid() = user_id);
create policy "delete own unss sessions" on unss_sessions for delete using (auth.uid() = user_id);

drop policy if exists "select own unss attendance" on unss_attendance;
drop policy if exists "insert own unss attendance" on unss_attendance;
drop policy if exists "delete own unss attendance" on unss_attendance;
create policy "select own unss attendance" on unss_attendance for select using (auth.uid() = user_id);
create policy "insert own unss attendance" on unss_attendance for insert with check (auth.uid() = user_id);
create policy "delete own unss attendance" on unss_attendance for delete using (auth.uid() = user_id);
