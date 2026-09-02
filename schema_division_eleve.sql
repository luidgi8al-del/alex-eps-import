-- Division de l'eleve (sa classe d'origine : 2.1, 6e3...) dans le repertoire de l'etablissement.
--
-- Le repertoire ne retenait pas la classe d'origine, alors que l'export de l'etablissement la
-- fournit. Sans elle, impossible de verser d'un coup tous les eleves d'une meme division dans une
-- classe : il fallait les cocher un par un dans une liste de plus de mille noms.
--
-- Colonne texte plutot qu'une reference vers une classe : la division est ce qu'ecrit
-- l'etablissement dans son export, pas une entite de l'application. Un eleve peut arriver avec une
-- division qui ne correspond a aucune classe creee ici, et cela ne doit rien empecher.
--
-- Valeur par defaut vide plutot que null : le tri et les comparaisons n'ont ainsi aucun cas
-- particulier a traiter, et une division inconnue se lit comme une division vide.

alter table public.unss_students
  add column if not exists division text not null default '';

-- Recherche par division : la liste sera triee et filtree dessus a chaque ouverture.
create index if not exists unss_students_division_idx
  on public.unss_students (institution_id, division);

-- Verification, a lancer apres :
--   select division, count(*) from unss_students where not deleted group by division order by division;
