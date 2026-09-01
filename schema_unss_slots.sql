-- Creneaux AS (module "Creneaux AS", app et site).
--
-- Un creneau est une offre d'activite de l'association sportive : une activite, un jour, un
-- horaire, un lieu. C'est ce parmi quoi l'eleve formule ses trois voeux au moment de sa licence.
-- Volontairement distinct de unss_groups : un groupe est une liste d'eleves reellement inscrits,
-- un creneau est ce qui est propose avant que les groupes ne soient constitues.
--
-- Partage a l'echelle de l'etablissement, comme le materiel : l'offre AS est commune aux
-- collegues, chacun doit voir les memes creneaux pour y placer les voeux de ses eleves.

create table if not exists unss_slots (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  institution_id uuid references institutions(id) on delete cascade,
  activity_name text not null default '',
  day_of_week text not null default '',              -- LUNDI | MARDI | MERCREDI | JEUDI | VENDREDI | SAMEDI
  start_time text not null default '',               -- HH:MM
  end_time text not null default '',
  location text not null default '',
  max_places int,
  comment text not null default '',
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index if not exists unss_slots_institution_idx on unss_slots(institution_id);

alter table unss_slots enable row level security;

drop policy if exists eps_read on unss_slots;
drop policy if exists eps_insert on unss_slots;
drop policy if exists eps_update on unss_slots;
drop policy if exists eps_delete on unss_slots;

-- Memes regles que les autres tables partagees d'etablissement (equipment, epi_items...) :
-- visible par tout l'etablissement, et repli sur le proprietaire tant qu'aucun etablissement
-- n'est rattache au compte.
create policy eps_read on unss_slots for select to authenticated
  using (eps_account_active() and (institution_id = eps_institution() or (institution_id is null and user_id = auth.uid())));
create policy eps_insert on unss_slots for insert to authenticated
  with check (eps_account_active() and user_id = auth.uid()
    and (institution_id = eps_institution() or (institution_id is null and eps_institution() is null)));
create policy eps_update on unss_slots for update to authenticated
  using (eps_account_active() and (institution_id = eps_institution() or (institution_id is null and user_id = auth.uid())))
  with check (eps_account_active() and (institution_id = eps_institution() or (institution_id is null and user_id = auth.uid())));
create policy eps_delete on unss_slots for delete to authenticated
  using (eps_account_active() and (institution_id = eps_institution() or (institution_id is null and user_id = auth.uid())));

-- Le declencheur partage force institution_id et user_id a l'insertion, et interdit de les
-- changer ensuite : un creneau ne peut pas etre deplace vers un autre etablissement.
drop trigger if exists eps_shared_identity on unss_slots;
create trigger eps_shared_identity before insert or update on unss_slots
  for each row execute function eps_shared_identity_guard();

-- Les trois voeux pointent desormais sur un creneau. L'intitule lisible reste stocke dans
-- wish1/2/3 : il survit a la suppression d'un creneau, et les voeux saisis en texte libre avant
-- ce module restent affichables tels quels.
alter table unss_students add column if not exists wish1_slot_id text references unss_slots(id) on delete set null;
alter table unss_students add column if not exists wish2_slot_id text references unss_slots(id) on delete set null;
alter table unss_students add column if not exists wish3_slot_id text references unss_slots(id) on delete set null;
