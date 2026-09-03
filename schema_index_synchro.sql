-- =================================================================================================
-- Index de lecture pour les tables ajoutees a la synchronisation hors connexion.
--
-- A APPLIQUER DANS SUPABASE (SQL Editor). Sans risque : rien n'est efface, et le fichier peut
-- etre relance autant de fois que voulu.
--
-- Pourquoi
-- --------
-- Chaque synchronisation demande a chaque table ce qui a change depuis un point donne, dans
-- l'ordre (updated_at, id). Sans index sur ce couple, la base parcourt la table entiere et la
-- trie, a chaque page et pour chaque table.
--
-- Les tables raccordees a l'origine avaient cet index (schema_versions_hors_connexion.sql). Les
-- quatre ajoutees ensuite, en raccordant Cours, ne l'ont jamais eu - dont evaluation_scores, qui
-- porte une ligne par eleve et par critere et qui est de loin la plus grosse. Le cout est reste
-- invisible tant que les lectures etaient courtes ; une lecture complete l'a rendu insoutenable,
-- jusqu'a saturer l'instance.
-- =================================================================================================

do $$
declare t text;
begin
  foreach t in array array['cycles','evaluations','evaluation_criteria','evaluation_scores'] loop
    if to_regclass('public.' || t) is not null then
      execute format('create index if not exists %I on public.%I (updated_at, id)', t || '_maj_idx', t);
    end if;
  end loop;
end $$;

-- Verification : les quatre index doivent apparaitre.
--   select indexname from pg_indexes
--    where schemaname = 'public' and indexname like '%_maj_idx' order by indexname;
