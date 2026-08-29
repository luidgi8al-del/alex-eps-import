-- ============================================================================
-- Alex EPS Outils — Programmes officiels, calendrier d'etablissement,
-- materiel et EPI escalade.
--
-- Ces quatre domaines n'existaient que sur le telephone (Room / SharedPreferences)
-- et ne remontaient jamais dans Supabase. Ce script cree leurs tables pour que le
-- site puisse les gerer a son tour.
--
-- Script idempotent : peut etre recolle entierement dans le SQL Editor Supabase
-- a chaque evolution. Meme principe que schema_planning.sql : lecture ouverte a
-- toute l'equipe EPS, ecriture reservee au proprietaire.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Programmes officiels
-- Les champs de contenu restent vides par defaut : l'outil n'invente jamais de
-- texte reglementaire, c'est au professeur de recopier les textes officiels.
-- ---------------------------------------------------------------------------
create table if not exists official_programs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  school_level text not null default 'COLLEGE',      -- ECOLE | COLLEGE | LYCEE
  class_level text not null default '',
  champ_apprentissage text not null default '',
  title text not null default '',
  general_objectives text not null default '',
  attendus text not null default '',
  competences text not null default '',
  elements_prioritaires text not null default '',
  example_apsa text not null default '',
  attendus_fin_de_cycle text not null default '',
  evaluation_elements text not null default '',
  source_officielle text not null default '',
  bulletin_officiel text not null default '',
  version_label text not null default '',
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index if not exists idx_official_programs_user_id on official_programs(user_id);

alter table official_programs enable row level security;

drop policy if exists "select all official programs" on official_programs;
drop policy if exists "insert own official programs" on official_programs;
drop policy if exists "update own official programs" on official_programs;
drop policy if exists "delete own official programs" on official_programs;
create policy "select all official programs" on official_programs for select using (auth.role() = 'authenticated');
create policy "insert own official programs" on official_programs for insert with check (auth.uid() = user_id);
create policy "update own official programs" on official_programs for update using (auth.uid() = user_id);
create policy "delete own official programs" on official_programs for delete using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- Calendrier d'etablissement
-- Vacances, examens, sorties, journees banalisees : ce qui bloque ou deplace
-- les cours dans l'annee.
-- ---------------------------------------------------------------------------
create table if not exists institution_calendar_events (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default '',
  kind text not null default 'AUTRE',                -- VACANCES | EXAMEN | SORTIE | BANALISEE | AUTRE
  start_date_epoch_millis bigint not null,
  end_date_epoch_millis bigint not null,
  comment text not null default '',
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index if not exists idx_institution_calendar_user_id on institution_calendar_events(user_id);

alter table institution_calendar_events enable row level security;

drop policy if exists "select all calendar events" on institution_calendar_events;
drop policy if exists "insert own calendar events" on institution_calendar_events;
drop policy if exists "update own calendar events" on institution_calendar_events;
drop policy if exists "delete own calendar events" on institution_calendar_events;
create policy "select all calendar events" on institution_calendar_events for select using (auth.role() = 'authenticated');
create policy "insert own calendar events" on institution_calendar_events for insert with check (auth.uid() = user_id);
create policy "update own calendar events" on institution_calendar_events for update using (auth.uid() = user_id);
create policy "delete own calendar events" on institution_calendar_events for delete using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- Materiel EPS
-- Suivi en stock initial / actuel / perdu / hors service.
-- ---------------------------------------------------------------------------
create table if not exists equipment (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  category text not null default 'AUTRE',
  brand text not null default '',
  reference text not null default '',
  quantity_initial int not null default 0,
  quantity_current int not null default 0,
  quantity_lost int not null default 0,
  quantity_out_of_service int not null default 0,
  location text not null default '',
  purchase_date_epoch_millis bigint,
  unit_price_cents bigint,
  supplier text not null default '',
  comment text not null default '',
  low_stock_threshold int,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index if not exists idx_equipment_user_id on equipment(user_id);

alter table equipment enable row level security;

drop policy if exists "select all equipment" on equipment;
drop policy if exists "insert own equipment" on equipment;
drop policy if exists "update own equipment" on equipment;
drop policy if exists "delete own equipment" on equipment;
create policy "select all equipment" on equipment for select using (auth.role() = 'authenticated');
create policy "insert own equipment" on equipment for insert with check (auth.uid() = user_id);
create policy "update own equipment" on equipment for update using (auth.uid() = user_id);
create policy "delete own equipment" on equipment for delete using (auth.uid() = user_id);


-- Achats : conserves pour l'historique meme si le materiel est modifie ensuite.
create table if not exists equipment_purchases (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  equipment_id text not null references equipment(id) on delete cascade,
  date_epoch_millis bigint not null,
  quantity int not null default 0,
  unit_price_cents bigint not null default 0,
  supplier text not null default '',
  comment text not null default '',
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index if not exists idx_equipment_purchases_equipment_id on equipment_purchases(equipment_id);

alter table equipment_purchases enable row level security;

drop policy if exists "select all equipment purchases" on equipment_purchases;
drop policy if exists "insert own equipment purchases" on equipment_purchases;
drop policy if exists "update own equipment purchases" on equipment_purchases;
drop policy if exists "delete own equipment purchases" on equipment_purchases;
create policy "select all equipment purchases" on equipment_purchases for select using (auth.role() = 'authenticated');
create policy "insert own equipment purchases" on equipment_purchases for insert with check (auth.uid() = user_id);
create policy "update own equipment purchases" on equipment_purchases for update using (auth.uid() = user_id);
create policy "delete own equipment purchases" on equipment_purchases for delete using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- EPI escalade : fiche de vie
-- La securite des eleves en depend : aucune ligne d'inspection n'est jamais
-- supprimee, le registre doit rester complet.
-- ---------------------------------------------------------------------------
create table if not exists epi_items (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  internal_id text not null default '',
  category text not null default 'AUTRE',
  manufacturer text not null default '',
  model text not null default '',
  manufacturer_reference text not null default '',
  serial_number text not null default '',
  lot_number text not null default '',
  color text not null default '',
  location text not null default '',
  manufacture_date_epoch_millis bigint,
  purchase_date_epoch_millis bigint,
  first_use_date_epoch_millis bigint,
  theoretical_lifespan_years int,
  end_of_life_date_epoch_millis bigint,
  last_inspection_date_epoch_millis bigint,
  next_inspection_date_epoch_millis bigint,
  comment text not null default '',
  status text not null default 'EN_SERVICE',         -- EN_SERVICE | A_CONTROLER | QUARANTAINE | REFORME
  qr_code_value text not null default '',
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index if not exists idx_epi_items_user_id on epi_items(user_id);

alter table epi_items enable row level security;

drop policy if exists "select all epi items" on epi_items;
drop policy if exists "insert own epi items" on epi_items;
drop policy if exists "update own epi items" on epi_items;
drop policy if exists "delete own epi items" on epi_items;
create policy "select all epi items" on epi_items for select using (auth.role() = 'authenticated');
create policy "insert own epi items" on epi_items for insert with check (auth.uid() = user_id);
create policy "update own epi items" on epi_items for update using (auth.uid() = user_id);
create policy "delete own epi items" on epi_items for delete using (auth.uid() = user_id);


-- Inspections : sert aussi de registre de mise en quarantaine et de reforme.
create table if not exists epi_inspections (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  epi_id text not null references epi_items(id) on delete cascade,
  date_epoch_millis bigint not null,
  inspector text not null default '',
  result text not null default 'CONFORME',           -- CONFORME | A_SURVEILLER | QUARANTAINE | REFORME
  observations text not null default '',
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index if not exists idx_epi_inspections_epi_id on epi_inspections(epi_id);

alter table epi_inspections enable row level security;

drop policy if exists "select all epi inspections" on epi_inspections;
drop policy if exists "insert own epi inspections" on epi_inspections;
drop policy if exists "update own epi inspections" on epi_inspections;
drop policy if exists "delete own epi inspections" on epi_inspections;
create policy "select all epi inspections" on epi_inspections for select using (auth.role() = 'authenticated');
create policy "insert own epi inspections" on epi_inspections for insert with check (auth.uid() = user_id);
create policy "update own epi inspections" on epi_inspections for update using (auth.uid() = user_id);
create policy "delete own epi inspections" on epi_inspections for delete using (auth.uid() = user_id);
