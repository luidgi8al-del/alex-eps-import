-- =================================================================================================
-- Deuxieme vague du hors connexion : ASLVH, tests EPS, sante, equipement, programmation.
--
-- A APPLIQUER DANS SUPABASE (SQL Editor) **AVANT** d'ouvrir le site apres cette mise a jour.
--
-- Sans risque : rien n'est efface, aucune ligne existante n'est modifiee, et le fichier peut etre
-- relance autant de fois que voulu. Toutes les operations sont conditionnelles.
--
-- Pourquoi c'est un prealable et non une option
-- ---------------------------------------------
-- Une table raccordee a la synchronisation est relue par son couple (updated_at, id). Sans index
-- sur ce couple, la base parcourt et trie la table entiere a chaque page et pour chaque table.
-- C'est exactement l'oubli qui a mis l'instance a genoux dans la nuit du 3 au 4 septembre 2026 :
-- quatre tables ajoutees sans leur index, et le processeur est passe a cent pour cent en quelques
-- minutes. Ce fichier pose les index en meme temps que les colonnes, pour que l'oubli ne puisse
-- pas se reproduire.
--
-- Retour en arriere : retirer les tables de TABLES_HORS_CONNEXION dans hors-connexion.js suffit.
-- Les colonnes et index poses ici ne genent personne s'ils ne servent pas.
-- =================================================================================================

-- ---------------------------------------------------------------------------------------------
-- 1. Colonnes manquantes.
--
-- Le moteur a besoin de deux choses sur chaque ligne : quand elle a change, et si elle est
-- effacee. Un effacement doit laisser une trace - sans quoi la ligne, absente du serveur mais
-- presente dans la copie locale, y reviendrait a la synchronisation suivante.
--
-- Les lignes existantes recoivent une date d'origine plutot que la date du jour : pretendre
-- qu'elles viennent d'etre modifiees ferait redescendre toute la table chez chaque collegue.
-- ---------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['unss_sessions', 'unss_attendance', 'health_dispensations',
                           'health_accidents', 'installation_conflict_overrides'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);
      execute format('alter table public.%I add column if not exists deleted boolean not null default false', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 2. Numero de version, la ou il manque.
--
-- Meme declencheur que schema_versions_hors_connexion.sql, applique aux tables de cette vague.
-- Une ecriture qui ne porte pas de version passe sans rien refuser : c'est ce que fait
-- l'application Android aujourd'hui, et elle ne doit pas s'arreter de fonctionner.
-- ---------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'unss_slots', 'unss_sessions', 'unss_attendance',
    'eps_test_sessions', 'eps_test_results',
    'health_dispensations', 'health_accidents',
    'epi_items', 'epi_inspections', 'installation_conflict_overrides',
    'official_programs', 'institution_calendar_events', 'eps_period_dates'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists version bigint not null default 1', t);
      execute format('drop trigger if exists eps_version_guard on public.%I', t);
      execute format('create trigger eps_version_guard before insert or update on public.%I
                      for each row execute function public.eps_bump_version()', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 3. Index de lecture. C'est la partie a ne pas sauter.
-- ---------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'unss_students', 'unss_groups', 'unss_slots', 'unss_memberships',
    'unss_sessions', 'unss_attendance',
    'eps_test_sessions', 'eps_test_results',
    'health_dispensations', 'health_accidents',
    'equipment', 'epi_items', 'epi_inspections', 'installation_conflict_overrides',
    'official_programs', 'annual_plan_blocks', 'institution_calendar_events', 'eps_period_dates'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('create index if not exists %I on public.%I (updated_at, id)', t || '_maj_idx', t);
    end if;
  end loop;
end $$;

analyze public.unss_students;  analyze public.unss_groups;      analyze public.unss_slots;
analyze public.unss_memberships; analyze public.unss_sessions;  analyze public.unss_attendance;
analyze public.eps_test_sessions; analyze public.eps_test_results;
analyze public.health_dispensations; analyze public.health_accidents;
analyze public.equipment; analyze public.epi_items; analyze public.epi_inspections;
analyze public.installation_conflict_overrides;
analyze public.official_programs; analyze public.annual_plan_blocks;
analyze public.institution_calendar_events; analyze public.eps_period_dates;


-- ---------------------------------------------------------------------------------------------
-- 4. Marque d'application.
--
-- Le site refuse de raccorder ces tables tant que cette marque n'existe pas. C'est la protection
-- qui manquait : le code peut etre publie avant que ce fichier soit passe, sans risque, et le
-- raccordement s'allume tout seul ensuite. Personne n'a a se souvenir de l'ordre des operations.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.eps_schema_marks (
  name text primary key,
  applied_at timestamptz not null default now()
);
alter table public.eps_schema_marks enable row level security;
drop policy if exists eps_schema_marks_read on public.eps_schema_marks;
create policy eps_schema_marks_read on public.eps_schema_marks
  for select to authenticated using (true);
insert into public.eps_schema_marks (name) values ('hors_connexion_2')
  on conflict (name) do update set applied_at = now();

-- ---------------------------------------------------------------------------------------------
-- Verification, a lancer apres. Les trente index doivent apparaitre.
--   select name, applied_at from public.eps_schema_marks;
--   select indexname from pg_indexes
--    where schemaname = 'public' and indexname like '%_maj_idx' order by indexname;
--
-- Et les colonnes posees a l'etape 1 :
--   select table_name, column_name from information_schema.columns
--    where table_schema = 'public' and column_name in ('updated_at','deleted')
--      and table_name in ('unss_sessions','unss_attendance','health_dispensations',
--                         'health_accidents','installation_conflict_overrides')
--    order by table_name, column_name;
-- ---------------------------------------------------------------------------------------------
