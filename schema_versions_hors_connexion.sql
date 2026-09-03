-- Numero de version par ligne, pour la saisie hors connexion.
--
-- Le moteur hors connexion doit savoir si la ligne qu'il renvoie a bouge entre-temps. Aujourd'hui
-- l'arbitrage repose sur updated_at, une date posee par le client : deux appareils dont les
-- horloges different se departagent mal, et rien n'empeche une modification ancienne d'en ecraser
-- une recente. Un compteur tenu par la base, lui, ne ment pas.
--
-- ATTENTION - a lire avant d'appliquer :
--
--   1. Ce fichier pose un declencheur sur des tables que l'application Android ecrit deja. Il est
--      concu pour ne rien lui casser : quand une ecriture ne porte pas de version - ce que fait
--      l'application aujourd'hui - le declencheur se contente d'incrementer, sans rien refuser.
--      Seule une ecriture qui annonce une version perimee est rejetee.
--
--   2. Il ne touche pas a updated_at. L'application arbitre encore dessus ; le lui reecrire cote
--      serveur ferait gagner le serveur a tous les coups.
--
--   3. Appliquez-le d'abord sur UNE table, verifiez, puis etendez. La liste est en clair plus bas.
--
-- Retour en arriere : supprimer le declencheur suffit, la colonne peut rester sans gener personne.
--   drop trigger if exists eps_version_guard on public.<table>;

-- ---------------------------------------------------------------------------------------------
-- Le declencheur, commun a toutes les tables.
-- ---------------------------------------------------------------------------------------------
create or replace function public.eps_bump_version()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    return new;
  end if;

  -- L'ecriture annonce la version sur laquelle elle s'appuie. Si elle ne correspond plus, c'est
  -- qu'un collegue est passe entre-temps : on refuse plutot que d'ecraser son travail. Le moteur
  -- hors connexion transforme ce refus en conflit a trancher, il ne perd rien.
  if new.version is not null and old.version is not null and new.version <> old.version then
    raise exception 'Version perimee : la ligne a ete modifiee ailleurs (attendu %, actuel %)',
      new.version, old.version using errcode = '40001';
  end if;

  new.version := coalesce(old.version, 0) + 1;
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Pose de la colonne et du declencheur.
--
-- Commencez par une seule table : remplacez la liste par array['classes'] par exemple, verifiez
-- que l'application et le site continuent d'enregistrer, puis relancez avec la liste complete.
-- ---------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'classes', 'students',
    'class_schedule_slots', 'period_activities', 'annual_plan_blocks',
    'unss_students', 'unss_groups', 'unss_memberships',
    'sport_installations', 'equipment',
    'cycles', 'evaluations', 'evaluation_criteria', 'evaluation_scores'
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
-- Lecture des changements depuis un point donne.
--
-- Sans cela chaque synchronisation relit toute la table. L'ordre porte sur (updated_at, id) et non
-- sur updated_at seul : deux lignes enregistrees dans la meme milliseconde se suivraient sinon
-- dans un ordre imprevisible, et la pagination en oublierait une.
-- ---------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['classes','students','class_schedule_slots','period_activities',
                           'unss_students','unss_groups','sport_installations','equipment',
                           -- Ajoutees en raccordant Cours. Les oublier ici a coute cher : sans
                           -- index, chaque page de lecture parcourait et triait la table entiere.
                           'cycles','evaluations','evaluation_criteria','evaluation_scores'] loop
    if to_regclass('public.' || t) is not null then
      execute format('create index if not exists %I on public.%I (updated_at, id)', t || '_maj_idx', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Verifications, a lancer apres.
-- ---------------------------------------------------------------------------------------------
-- 1. Les colonnes et declencheurs sont en place :
--   select c.relname as table_, t.tgname as declencheur
--     from pg_trigger t join pg_class c on c.oid = t.tgrelid
--    where t.tgname = 'eps_version_guard' order by c.relname;
--
-- 2. Une ecriture sans version passe (c'est ce que fait l'application Android) :
--   update classes set name = name where id = (select id from classes limit 1);
--
-- 3. Une ecriture avec une version perimee est refusee (doit lever "Version perimee") :
--   update classes set version = 1 where id = (select id from classes where version > 1 limit 1);
