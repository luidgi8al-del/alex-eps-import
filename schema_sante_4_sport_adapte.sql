-- Sport adapte : ce que l'eleve peut encore faire, a cote du motif qui dit pourquoi.
--
-- Le motif (blessure, maladie...) et l'amenagement sont deux informations differentes : un eleve
-- peut avoir une entorse ET pouvoir nager. Les melanger dans la meme liste obligeait a choisir
-- entre dire la cause et dire ce qui reste possible - c'est justement ce dont on a besoin au bord
-- du terrain.
--
-- Idempotent : ce fichier peut etre relance sans risque.
begin;

alter table public.health_dispensations
  add column if not exists aptitude text,
  add column if not exists adapted_activities text;

-- Deux valeurs seulement, pour que le filtre "qui est en sport adapte ?" reste fiable.
-- null = non renseigne : les dispenses deja saisies ne sont pas requalifiees d'office.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'health_dispense_aptitude') then
    alter table public.health_dispensations add constraint health_dispense_aptitude
      check (aptitude is null or aptitude in ('INAPTE_TOTAL', 'SPORT_ADAPTE'));
  end if;
end $$;

-- Retrouver les eleves en sport adapte encore en cours, sans parcourir toute la table.
create index if not exists health_dispense_aptitude_idx
  on public.health_dispensations (aptitude, end_date desc) where deleted = false;

insert into public.eps_schema_marks (name) values ('sante_4')
  on conflict (name) do update set applied_at = now();

analyze public.health_dispensations;
commit;

-- Verification apres coup :
-- select column_name from information_schema.columns
--   where table_name = 'health_dispensations' and column_name in ('aptitude','adapted_activities');
