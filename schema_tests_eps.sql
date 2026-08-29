-- ============================================================================
-- Alex EPS Outils — Resultats des tests EPS (module Outils)
--
-- Le module Tests EPS enregistre, pour une classe et une periode, la valeur
-- saisie et la valeur calculee de chaque eleve. Ces tables n'existaient que
-- dans la base Room de l'application.
--
-- Script idempotent : peut etre recolle entierement dans le SQL Editor Supabase
-- a chaque evolution.
-- ============================================================================

create table if not exists eps_test_sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id text not null references classes(id) on delete cascade,
  period_number int not null default 1,
  test_name text not null default '',
  created_at bigint not null,
  -- Libelle denormalise, comme class_schedule_slots : afficher un recapitulatif
  -- sans avoir a lire la table "classes" des collegues, qui reste privee.
  class_label text not null default '',
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index if not exists idx_eps_test_sessions_user_id on eps_test_sessions(user_id);
create index if not exists idx_eps_test_sessions_class_id on eps_test_sessions(class_id);

alter table eps_test_sessions enable row level security;

drop policy if exists "select all eps test sessions" on eps_test_sessions;
drop policy if exists "insert own eps test sessions" on eps_test_sessions;
drop policy if exists "update own eps test sessions" on eps_test_sessions;
drop policy if exists "delete own eps test sessions" on eps_test_sessions;
create policy "select all eps test sessions" on eps_test_sessions for select using (auth.role() = 'authenticated');
create policy "insert own eps test sessions" on eps_test_sessions for insert with check (auth.uid() = user_id);
create policy "update own eps test sessions" on eps_test_sessions for update using (auth.uid() = user_id);
create policy "delete own eps test sessions" on eps_test_sessions for delete using (auth.uid() = user_id);


-- Une ligne par eleve : la valeur saisie sur le terrain et la valeur calculee,
-- chacune avec son unite, pour que le recapitulatif reste lisible sans rejouer
-- la formule du test.
create table if not exists eps_test_results (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null references eps_test_sessions(id) on delete cascade,
  student_id text not null references students(id) on delete cascade,
  input_value double precision not null default 0,
  result_value double precision not null default 0,
  input_unit text not null default '',
  result_unit text not null default '',
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index if not exists idx_eps_test_results_session_id on eps_test_results(session_id);
create index if not exists idx_eps_test_results_student_id on eps_test_results(student_id);

alter table eps_test_results enable row level security;

drop policy if exists "select all eps test results" on eps_test_results;
drop policy if exists "insert own eps test results" on eps_test_results;
drop policy if exists "update own eps test results" on eps_test_results;
drop policy if exists "delete own eps test results" on eps_test_results;
create policy "select all eps test results" on eps_test_results for select using (auth.role() = 'authenticated');
create policy "insert own eps test results" on eps_test_results for insert with check (auth.uid() = user_id);
create policy "update own eps test results" on eps_test_results for update using (auth.uid() = user_id);
create policy "delete own eps test results" on eps_test_results for delete using (auth.uid() = user_id);
