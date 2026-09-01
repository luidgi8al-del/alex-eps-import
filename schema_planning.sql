-- ============================================================================
-- Alex EPS Outils — Planning hebdomadaire (onglet Programmation > Planning)
-- Ce script est idempotent : on peut le recoller entierement dans le SQL Editor
-- Supabase a chaque evolution du Planning (que la premiere version ait deja ete
-- executee ou non). Miroir des entites Room cote app Android.
-- ============================================================================

create table if not exists class_schedule_slots (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id text not null references classes(id) on delete cascade,
  day_of_week text not null,        -- LUNDI..SAMEDI
  start_time text not null,         -- "HH:mm"
  duration_minutes int not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

-- Installation utilisee (texte libre), et libelles denormalises (classe, enseignant) pour que
-- Planning global EPS puisse afficher le planning de tous les comptes sans avoir besoin de lire
-- les tables "classes" ou profils des autres comptes (elles restent privees).
alter table class_schedule_slots add column if not exists installation_name text;
alter table class_schedule_slots add column if not exists class_label text not null default '';
alter table class_schedule_slots add column if not exists teacher_label text not null default '';

create table if not exists period_activities (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_id text not null references class_schedule_slots(id) on delete cascade,
  period_number int not null,
  apsa_name text not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  unique (slot_id, period_number)
);

alter table period_activities add column if not exists installation_name text;

-- Installations sportives de l'etablissement (module Equipement) : reste privee a chaque
-- compte (juste une liste de noms proposee au moment de poser un creneau) ; ce qui devient
-- visible entre collegues, c'est le nom choisi sur le creneau (installation_name ci-dessus),
-- pas cette liste de gestion.
create table if not exists sport_installations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index if not exists idx_class_schedule_slots_user_id on class_schedule_slots(user_id);
create index if not exists idx_class_schedule_slots_class_id on class_schedule_slots(class_id);
create index if not exists idx_period_activities_user_id on period_activities(user_id);
create index if not exists idx_period_activities_slot_id on period_activities(slot_id);
create index if not exists idx_sport_installations_user_id on sport_installations(user_id);

alter table class_schedule_slots enable row level security;
alter table period_activities enable row level security;
alter table sport_installations enable row level security;

-- Planning global EPS a besoin de lire les creneaux de TOUS les comptes (chevauchements
-- d'installations entre collegues) : la lecture est donc ouverte a tout utilisateur connecte,
-- mais ecrire/modifier/supprimer reste reserve au proprietaire du creneau.
drop policy if exists "select own schedule slots" on class_schedule_slots;
drop policy if exists "select all schedule slots" on class_schedule_slots;
drop policy if exists "insert own schedule slots" on class_schedule_slots;
drop policy if exists "update own schedule slots" on class_schedule_slots;
drop policy if exists "delete own schedule slots" on class_schedule_slots;
create policy "select all schedule slots" on class_schedule_slots for select using (auth.role() = 'authenticated');
create policy "insert own schedule slots" on class_schedule_slots for insert with check (auth.uid() = user_id);
create policy "update own schedule slots" on class_schedule_slots for update using (auth.uid() = user_id);
create policy "delete own schedule slots" on class_schedule_slots for delete using (auth.uid() = user_id);

drop policy if exists "select own period activities" on period_activities;
drop policy if exists "insert own period activities" on period_activities;
drop policy if exists "update own period activities" on period_activities;
drop policy if exists "delete own period activities" on period_activities;
create policy "select own period activities" on period_activities for select using (auth.uid() = user_id);
create policy "insert own period activities" on period_activities for insert with check (auth.uid() = user_id);
create policy "update own period activities" on period_activities for update using (auth.uid() = user_id);
create policy "delete own period activities" on period_activities for delete using (auth.uid() = user_id);

drop policy if exists "select own installations" on sport_installations;
drop policy if exists "insert own installations" on sport_installations;
drop policy if exists "update own installations" on sport_installations;
drop policy if exists "delete own installations" on sport_installations;
create policy "select own installations" on sport_installations for select using (auth.uid() = user_id);
create policy "insert own installations" on sport_installations for insert with check (auth.uid() = user_id);
create policy "update own installations" on sport_installations for update using (auth.uid() = user_id);
create policy "delete own installations" on sport_installations for delete using (auth.uid() = user_id);

-- Bouton "Analyser" de Planning global EPS : une fois qu'un chevauchement d'installation entre
-- deux comptes a ete regarde et juge acceptable ("Valider quand meme"), il ne doit plus
-- reapparaitre a la prochaine analyse. slot_id_a/slot_id_b sont toujours ranges dans l'ordre
-- alphabetique (peu importe qui valide) pour que la paire se reconnaisse quel que soit l'ordre.
create table if not exists installation_conflict_overrides (
  id text primary key,
  slot_id_a text not null,
  slot_id_b text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (slot_id_a, slot_id_b)
);

create index if not exists idx_conflict_overrides_pair on installation_conflict_overrides(slot_id_a, slot_id_b);

alter table installation_conflict_overrides enable row level security;

drop policy if exists "select all conflict overrides" on installation_conflict_overrides;
drop policy if exists "insert own conflict overrides" on installation_conflict_overrides;
drop policy if exists "delete own conflict overrides" on installation_conflict_overrides;
create policy "select all conflict overrides" on installation_conflict_overrides for select using (auth.role() = 'authenticated');
create policy "insert own conflict overrides" on installation_conflict_overrides for insert with check (auth.uid() = created_by);
create policy "delete own conflict overrides" on installation_conflict_overrides for delete using (auth.uid() = created_by);
