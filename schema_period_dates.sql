-- Dates des periodes (module Programmation EPS, app et site).
--
-- Les periodes des niveaux 6e a 1re suivent le calendrier commun de l'etablissement et restent
-- des constantes dans les deux clients. Seule la Terminale a un decoupage personnalise, parce
-- que ses periodes ne suivent pas le calendrier commun.
--
-- Ce decoupage ne vivait jusqu'ici que dans les preferences locales de l'application : il etait
-- donc invisible sur le site, et perdu au changement de telephone. Il devient une donnee
-- partagee a l'echelle de l'etablissement, comme le planning : tous les collegues doivent lire
-- le meme decoupage, sinon deux professeurs placeraient leurs cycles sur des periodes
-- differentes.

create table if not exists eps_period_dates (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  institution_id uuid references institutions(id) on delete cascade,
  school_year text not null default '2026-2027',
  grade text not null,                                -- TERMINALE, et tout niveau au decoupage propre
  number int not null,                                -- numero de periode, 1 a 5
  start_date date not null,
  end_date date not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index if not exists eps_period_dates_lookup_idx
  on eps_period_dates(institution_id, school_year, grade, number);

alter table eps_period_dates enable row level security;

drop policy if exists eps_read on eps_period_dates;
drop policy if exists eps_insert on eps_period_dates;
drop policy if exists eps_update on eps_period_dates;
drop policy if exists eps_delete on eps_period_dates;

-- Memes regles que les autres tables partagees d'etablissement (equipment, unss_slots...) :
-- visible par tout l'etablissement, avec repli sur le proprietaire tant qu'aucun etablissement
-- n'est rattache au compte.
create policy eps_read on eps_period_dates for select to authenticated
  using (eps_account_active() and (institution_id = eps_institution() or (institution_id is null and user_id = auth.uid())));
create policy eps_insert on eps_period_dates for insert to authenticated
  with check (eps_account_active() and user_id = auth.uid()
    and (institution_id = eps_institution() or (institution_id is null and eps_institution() is null)));
create policy eps_update on eps_period_dates for update to authenticated
  using (eps_account_active() and (institution_id = eps_institution() or (institution_id is null and user_id = auth.uid())))
  with check (eps_account_active() and (institution_id = eps_institution() or (institution_id is null and user_id = auth.uid())));
create policy eps_delete on eps_period_dates for delete to authenticated
  using (eps_account_active() and (institution_id = eps_institution() or (institution_id is null and user_id = auth.uid())));

-- Le declencheur partage force institution_id et user_id a l'insertion et interdit de les
-- changer ensuite : une periode ne peut pas etre deplacee vers un autre etablissement.
drop trigger if exists eps_shared_identity on eps_period_dates;
create trigger eps_shared_identity before insert or update on eps_period_dates
  for each row execute function eps_shared_identity_guard();
