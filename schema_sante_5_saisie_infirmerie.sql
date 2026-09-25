-- Qui a saisi la dispense : le professeur, ou l'infirmerie depuis le Google Sheet.
--
-- Une dispense saisie dans le Sheet est posee au nom du professeur de l'eleve : c'est chez lui
-- qu'elle doit apparaitre, et lui seul peut la corriger. Rien ne la distinguait donc d'une
-- dispense qu'il aurait saisie lui-meme. Cette colonne garde la trace de la provenance, sans
-- changer a qui la dispense appartient.
--
-- null = saisie par le professeur lui-meme. Les dispenses deja enregistrees le restent : on ne
-- requalifie pas apres coup une provenance que l'on ne connait pas.
--
-- Idempotent : ce fichier peut etre relance sans risque.
begin;

alter table public.health_dispensations
  add column if not exists entered_by text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'health_dispense_entered_by') then
    alter table public.health_dispensations add constraint health_dispense_entered_by
      check (entered_by is null or entered_by in ('INFIRMERIE'));
  end if;
end $$;

insert into public.eps_schema_marks (name) values ('sante_5')
  on conflict (name) do update set applied_at = now();

analyze public.health_dispensations;
commit;

-- Verification apres coup :
-- select column_name from information_schema.columns
--   where table_name = 'health_dispensations' and column_name = 'entered_by';
