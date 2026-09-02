-- Droits reserves a l'administrateur de l'etablissement.
--
-- Les tables partagees etaient modifiables et supprimables par tout professeur de l'etablissement.
-- C'etait sans consequence tant que le repertoire d'eleves vivait dans un onglet AS peu frequente ;
-- il devient le point de passage de tout le monde, et une suppression malheureuse effacerait le
-- travail de tous les collegues.
--
-- Masquer un bouton ne protege rien : tant que la regle en base autorise l'action, elle reste
-- atteignable autrement, et une synchro depuis un telephone suffirait. Ce fichier pose donc
-- l'interdiction la ou elle compte.
--
-- Ce qui reste ouvert a tous, volontairement :
--   - corriger la fiche d'un eleve : une coquille se rattrape sans deranger l'administrateur ;
--   - inscrire un eleve dans un groupe AS : c'est une autre table (unss_memberships), et le
--     professeur responsable doit pouvoir remplir son propre creneau.

-- ATTENTION, A LANCER D'ABORD, SEUL.
-- Si aucun compte n'etait reconnu comme administrateur, ce fichier empecherait TOUT LE MONDE
-- d'ajouter un eleve. Verifiez d'abord qui administre :
--
--   select u.email as administrateur, i.name as etablissement, i.code
--     from institutions i join auth.users u on u.id = i.created_by;
--
-- Votre adresse doit apparaitre en face de votre etablissement. Si la requete ne renvoie rien,
-- n'appliquez pas la suite.
--
-- N'utilisez pas eps_is_admin() pour cette verification : l'editeur SQL n'ouvre pas de session
-- utilisateur, auth.uid() y vaut null, et la fonction repondrait toujours false - y compris a un
-- administrateur. Elle n'a de sens qu'appelee par l'application, jeton en main.
--
-- Pour revenir en arriere, il suffit de reappliquer schema_team_administration_1.sql, qui
-- reconstruit toutes ces regles dans leur version ouverte a tous.

-- L'ajout au repertoire est reserve a l'administrateur. C'est aussi ce qui rend l'import CSV
-- reellement garanti : une insertion en masse et une insertion a l'unite sont indistinguables
-- pour la base, donc seule l'interdiction des deux protege du premier.
drop policy if exists eps_insert on public.unss_students;
create policy eps_insert on public.unss_students for insert to authenticated
  with check (eps_account_active() and user_id = auth.uid() and eps_is_admin(eps_institution())
     and (institution_id = eps_institution() or (institution_id is null and eps_institution() is null)));

-- Une suppression est enregistree comme une modification qui pose deleted = true. On l'interdit
-- donc dans le WITH CHECK plutot que dans une regle de suppression, qui ne serait jamais atteinte.
drop policy if exists eps_update on public.unss_students;
create policy eps_update on public.unss_students for update to authenticated
  using (eps_account_active() and (institution_id = eps_institution()
     or (institution_id is null and user_id = auth.uid())))
  with check (eps_account_active()
     and (institution_id = eps_institution() or (institution_id is null and user_id = auth.uid()))
     -- Seul l'administrateur peut marquer un eleve supprime ; chacun peut corriger sa fiche.
     and (not deleted or eps_is_admin(eps_institution())));

-- La suppression definitive (jamais utilisee par l'application, qui pose un tombstone) suit la
-- meme regle, pour qu'aucun chemin ne contourne l'autre.
drop policy if exists eps_delete on public.unss_students;
create policy eps_delete on public.unss_students for delete to authenticated
  using (eps_account_active() and eps_is_admin(eps_institution()));

-- Groupes AS : la creation etait deja reservee, la suppression restait ouverte.
drop policy if exists eps_delete on public.unss_groups;
create policy eps_delete on public.unss_groups for delete to authenticated
  using (eps_account_active() and eps_is_admin(eps_institution()));

drop policy if exists eps_update on public.unss_groups;
create policy eps_update on public.unss_groups for update to authenticated
  using (eps_account_active() and (institution_id = eps_institution()
     or (institution_id is null and user_id = auth.uid())))
  with check (eps_account_active()
     and (institution_id = eps_institution() or (institution_id is null and user_id = auth.uid()))
     -- Le professeur responsable garde la main sur son groupe ; seul l'administrateur le supprime.
     and (not deleted or eps_is_admin(eps_institution())));

-- Installations et materiel : ajouter ou retirer une installation change le tableau d'occupation
-- et le reperage des chevauchements pour tout l'etablissement.
do $$ declare t text; begin
  foreach t in array array['sport_installations','equipment'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop policy if exists eps_insert on public.%I',t);
      execute format('create policy eps_insert on public.%I for insert to authenticated
        with check(eps_account_active() and user_id=auth.uid() and eps_is_admin(eps_institution())
          and (institution_id=eps_institution() or (institution_id is null and eps_institution() is null)))',t);

      execute format('drop policy if exists eps_update on public.%I',t);
      execute format('create policy eps_update on public.%I for update to authenticated
        using(eps_account_active() and (institution_id=eps_institution() or (institution_id is null and user_id=auth.uid())))
        with check(eps_account_active() and eps_is_admin(eps_institution()))',t);

      execute format('drop policy if exists eps_delete on public.%I',t);
      execute format('create policy eps_delete on public.%I for delete to authenticated
        using(eps_account_active() and eps_is_admin(eps_institution()))',t);
    end if;
  end loop;
end $$;

-- Verification : a lancer apres, pour lire ce qui est reellement en place.
-- select tablename, policyname, cmd, qual, with_check
--   from pg_policies
--  where schemaname = 'public'
--    and tablename in ('unss_students','unss_groups','sport_installations','equipment')
--  order by tablename, cmd;
