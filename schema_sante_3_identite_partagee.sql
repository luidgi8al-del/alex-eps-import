-- Noms lisibles avec une dispense partagee, sans ouvrir tout le repertoire des eleves.
-- Idempotent : ce fichier peut etre relance sans risque.
begin;

alter table public.health_dispensations
  add column if not exists student_last_name text,
  add column if not exists student_first_name text,
  add column if not exists class_name text;

-- Complete les dispenses deja enregistrees. Cette mise a jour est executee par le proprietaire
-- de la base dans l'editeur SQL et n'est donc pas bloquee par les droits des professeurs.
update public.health_dispensations d
set student_last_name = coalesce(d.student_last_name, s.last_name),
    student_first_name = coalesce(d.student_first_name, s.first_name)
from public.students s
where s.id = d.student_id
  and (d.student_last_name is null or d.student_first_name is null);

update public.health_dispensations d
set class_name = coalesce(d.class_name, c.name)
from public.classes c
where c.id = d.class_id and d.class_name is null;

insert into public.eps_schema_marks (name) values ('sante_3')
  on conflict (name) do update set applied_at = now();

analyze public.health_dispensations;
commit;
