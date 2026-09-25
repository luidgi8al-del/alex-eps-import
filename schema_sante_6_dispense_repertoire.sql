-- Une dispense pour un eleve du repertoire, meme sans classe d'affectation.
--
-- Le repertoire des eleves (unss_students, 1800 fiches) et les eleves de classe (students) sont
-- deux tables sans lien : un eleve n'entre dans students que le jour ou un professeur verse sa
-- division dans sa classe. Jusqu'ici la dispense exigeait les deux - une classe ET un eleve de
-- classe - donc l'infirmerie ne pouvait rien saisir pour les trois quarts de l'etablissement.
--
-- Une dispense peut desormais designer l'un OU l'autre :
--   - un eleve de classe : student_id + class_id, comme avant, rien ne change ;
--   - un eleve du repertoire : unss_student_id, avec sa division recopiee dans class_name.
--
-- Le raccordement se fera tout seul : le jour ou la division est versee dans une classe, l'eleve
-- de classe porte les memes nom, prenom et naissance - la cle par laquelle l'application
-- rapproche deja ces deux tables partout ailleurs.
--
-- Idempotent : ce fichier peut etre relance sans risque.
begin;

alter table public.health_dispensations alter column class_id drop not null;
alter table public.health_dispensations alter column student_id drop not null;

alter table public.health_dispensations
  add column if not exists unss_student_id text references public.unss_students(id) on delete set null;

-- Le garde-fou qui remplace les deux "not null" : une dispense doit designer quelqu'un. Sans lui,
-- une ligne sans eleve du tout deviendrait possible, et plus rien ne la rattacherait a personne.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'health_dispense_cible') then
    alter table public.health_dispensations add constraint health_dispense_cible
      check (student_id is not null or unss_student_id is not null);
  end if;
end $$;

create index if not exists health_dispense_unss_idx
  on public.health_dispensations (unss_student_id) where deleted = false;

insert into public.eps_schema_marks (name) values ('sante_6')
  on conflict (name) do update set applied_at = now();

analyze public.health_dispensations;
commit;

-- Verification apres coup :
-- select column_name, is_nullable from information_schema.columns
--   where table_name = 'health_dispensations'
--     and column_name in ('class_id','student_id','unss_student_id');
