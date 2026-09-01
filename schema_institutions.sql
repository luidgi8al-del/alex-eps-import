-- ============================================================================
-- Alex EPS Outils — Rattachement a un etablissement (Parametres > Compte web,
-- onglet Accueil du site). Script idempotent : peut etre recolle entierement
-- dans le SQL Editor Supabase a chaque evolution.
--
-- Principe : n'importe quel utilisateur peut creer un etablissement en lui
-- donnant un nom et un code de son choix (ex : "Lycee Victor Hugo" / "32320"),
-- puis partage ce code a ses collegues pour qu'ils rejoignent le meme
-- etablissement. Le Planning et la Programmation annuelle, jusque-la partages
-- avec TOUT utilisateur connecte de l'application, ne se partagent desormais
-- qu'entre comptes du meme etablissement.
--
-- La table institutions reste fermee en lecture directe (sinon n'importe qui
-- pourrait lister tous les codes existants) : toute creation/adhesion passe
-- par les fonctions SECURITY DEFINER create_institution / join_institution_by_code
-- ci-dessous, qui sont les seules a pouvoir lire un code pour verifier son
-- existence.
-- ============================================================================

create table if not exists institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  institution_id uuid references institutions(id) on delete set null,
  email text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_institution_id on profiles(institution_id);

alter table institutions enable row level security;
alter table profiles enable row level security;

drop policy if exists "select own institution" on institutions;
create policy "select own institution" on institutions for select using (
  id in (select institution_id from profiles where id = auth.uid())
);

-- Les libelles denormalises (teacher_label) sur Planning/Programmation exposent deja l'email de
-- chaque collegue a tous les comptes de l'appli : ouvrir la lecture de profiles ne revele donc
-- rien de plus, et permet aux policies de partage ci-dessous de comparer facilement deux
-- institution_id sans fonction intermediaire.
drop policy if exists "select all profiles" on profiles;
drop policy if exists "insert own profile" on profiles;
drop policy if exists "update own profile" on profiles;
create policy "select all profiles" on profiles for select using (auth.role() = 'authenticated');
create policy "insert own profile" on profiles for insert with check (auth.uid() = id);
create policy "update own profile" on profiles for update using (auth.uid() = id);

create or replace function create_institution(p_name text, p_code text)
returns institutions
language plpgsql
security definer
set search_path = public
as $$
declare
  new_inst institutions;
begin
  if trim(p_name) = '' or trim(p_code) = '' then
    raise exception 'Nom et code requis.';
  end if;

  insert into institutions (name, code, created_by)
  values (trim(p_name), trim(p_code), auth.uid())
  returning * into new_inst;

  insert into profiles (id, institution_id, email, updated_at)
  values (auth.uid(), new_inst.id, auth.email(), now())
  on conflict (id) do update set institution_id = excluded.institution_id, updated_at = now();

  return new_inst;
end;
$$;

create or replace function join_institution_by_code(p_code text)
returns institutions
language plpgsql
security definer
set search_path = public
as $$
declare
  found_inst institutions;
begin
  select * into found_inst from institutions where code = trim(p_code);
  if found_inst.id is null then
    raise exception 'Code etablissement introuvable.';
  end if;

  insert into profiles (id, institution_id, email, updated_at)
  values (auth.uid(), found_inst.id, auth.email(), now())
  on conflict (id) do update set institution_id = excluded.institution_id, updated_at = now();

  return found_inst;
end;
$$;

create or replace function leave_institution()
returns void
language sql
security definer
set search_path = public
as $$
  update profiles set institution_id = null, updated_at = now() where id = auth.uid();
$$;

grant execute on function create_institution(text, text) to authenticated;
grant execute on function join_institution_by_code(text) to authenticated;
grant execute on function leave_institution() to authenticated;

-- ---------------------------------------------------------------------------
-- Partage scope a l'etablissement : remplace les policies "select all ... using
-- (auth.role() = 'authenticated')" de schema_planning.sql / schema_programmation.sql
-- par une comparaison d'institution_id entre le lecteur et le proprietaire de la ligne.
-- Un compte non rattache (institution_id null) ne voit ni ne partage plus rien.
-- ---------------------------------------------------------------------------

create or replace function same_institution(owner_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from profiles me
    join profiles owner on owner.id = owner_id
    where me.id = auth.uid()
      and me.institution_id is not null
      and me.institution_id = owner.institution_id
  );
$$;

grant execute on function same_institution(uuid) to authenticated;

-- Etat commun de finalisation du planning EPS. Une ligne par etablissement : tous les membres
-- voient le meme bouton Valide/En modification et le meme calendrier d'utilisation.
create table if not exists planning_validations (
  institution_id uuid primary key references institutions(id) on delete cascade,
  validated boolean not null default false,
  updated_by uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table planning_validations enable row level security;
drop policy if exists "select institution planning validation" on planning_validations;
drop policy if exists "insert institution planning validation" on planning_validations;
drop policy if exists "update institution planning validation" on planning_validations;
create policy "select institution planning validation" on planning_validations for select using (same_institution(updated_by));
create policy "insert institution planning validation" on planning_validations for insert with check (same_institution(updated_by));
create policy "update institution planning validation" on planning_validations for update using (same_institution(updated_by)) with check (same_institution(updated_by));

drop policy if exists "select all schedule slots" on class_schedule_slots;
drop policy if exists "select institution schedule slots" on class_schedule_slots;
create policy "select institution schedule slots" on class_schedule_slots for select using (
  auth.uid() = user_id or same_institution(user_id)
);

drop policy if exists "select own period activities" on period_activities;
drop policy if exists "select institution period activities" on period_activities;
create policy "select institution period activities" on period_activities for select using (
  auth.uid() = user_id or same_institution(user_id)
);

drop policy if exists "select all annual plan blocks" on annual_plan_blocks;
drop policy if exists "select institution annual plan blocks" on annual_plan_blocks;
create policy "select institution annual plan blocks" on annual_plan_blocks for select using (
  auth.uid() = user_id or same_institution(user_id)
);

drop policy if exists "select all conflict overrides" on installation_conflict_overrides;
drop policy if exists "select institution conflict overrides" on installation_conflict_overrides;
create policy "select institution conflict overrides" on installation_conflict_overrides for select using (
  auth.uid() = created_by or same_institution(created_by)
);
