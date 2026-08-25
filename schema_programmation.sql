-- ============================================================================
-- Alex EPS Outils — Programmation annuelle (module Programmation)
-- Script idempotent : peut etre recolle entierement dans le SQL Editor Supabase
-- a chaque evolution. Meme principe que schema_planning.sql (Planning global EPS) :
-- lecture ouverte a toute l'equipe EPS, ecriture reservee au proprietaire.
-- ============================================================================

create table if not exists annual_plan_blocks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id text not null references classes(id) on delete cascade,
  apsa_name text not null,
  start_date_epoch_millis bigint not null,
  end_date_epoch_millis bigint not null,
  session_count int not null default 0,
  champ_apprentissage text not null default '',
  -- Libelles denormalises (comme class_schedule_slots) : Programmation EPS peut afficher la
  -- programmation de tous les comptes sans avoir besoin de lire la table "classes" des autres,
  -- qui reste privee.
  class_label text not null default '',
  teacher_label text not null default '',
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index if not exists idx_annual_plan_blocks_user_id on annual_plan_blocks(user_id);
create index if not exists idx_annual_plan_blocks_class_id on annual_plan_blocks(class_id);

alter table annual_plan_blocks enable row level security;

drop policy if exists "select all annual plan blocks" on annual_plan_blocks;
drop policy if exists "insert own annual plan blocks" on annual_plan_blocks;
drop policy if exists "update own annual plan blocks" on annual_plan_blocks;
drop policy if exists "delete own annual plan blocks" on annual_plan_blocks;
create policy "select all annual plan blocks" on annual_plan_blocks for select using (auth.role() = 'authenticated');
create policy "insert own annual plan blocks" on annual_plan_blocks for insert with check (auth.uid() = user_id);
create policy "update own annual plan blocks" on annual_plan_blocks for update using (auth.uid() = user_id);
create policy "delete own annual plan blocks" on annual_plan_blocks for delete using (auth.uid() = user_id);
