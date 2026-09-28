-- Partage fiable des dispenses entre les professeurs d'un meme etablissement.
--
-- Jusqu'ici la lecture partagee retrouvait l'etablissement indirectement par user_id. Une
-- dispense creee par la passerelle de l'infirmerie pouvait donc rester visible seulement chez
-- son compte de reference. L'etablissement est maintenant enregistre sur la ligne elle-meme.
--
-- Idempotent : ce fichier peut etre relance. Il n'efface aucune dispense.
begin;

alter table public.health_dispensations
  add column if not exists institution_id uuid references public.institutions(id);

-- Le proprietaire de la dispense donne normalement son etablissement.
update public.health_dispensations d
set institution_id = p.institution_id
from public.profiles p
where d.institution_id is null
  and p.id = d.user_id
  and p.institution_id is not null;

-- Repli pour une ancienne ligne dont le proprietaire n'est plus rattache, mais dont l'eleve
-- appartient encore a un professeur de l'etablissement.
update public.health_dispensations d
set institution_id = p.institution_id
from public.students s
join public.profiles p on p.id = s.user_id
where d.institution_id is null
  and s.id = d.student_id
  and p.institution_id is not null;

-- Repli pour une dispense posee directement sur le repertoire general des eleves.
update public.health_dispensations d
set institution_id = u.institution_id
from public.unss_students u
where d.institution_id is null
  and u.id = d.unss_student_id
  and u.institution_id is not null;

-- Les saisies ordinaires du site ne doivent pas avoir a connaitre cette colonne. Le serveur la
-- complete avant de verifier les droits, y compris pour une saisie preparee hors connexion.
create or replace function public.eps_health_dispense_institution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.institution_id is null and new.user_id is not null then
    select p.institution_id into new.institution_id
    from public.profiles p where p.id = new.user_id;
  end if;

  if new.institution_id is null and new.student_id is not null then
    select p.institution_id into new.institution_id
    from public.students s
    join public.profiles p on p.id = s.user_id
    where s.id = new.student_id;
  end if;

  if new.institution_id is null and new.unss_student_id is not null then
    select u.institution_id into new.institution_id
    from public.unss_students u where u.id = new.unss_student_id;
  end if;

  if tg_op = 'UPDATE' and old.institution_id is not null
     and new.institution_id is distinct from old.institution_id then
    raise exception 'L''etablissement d''une dispense ne peut pas etre change';
  end if;
  return new;
end $$;

drop trigger if exists eps_health_dispense_institution on public.health_dispensations;
create trigger eps_health_dispense_institution
  before insert or update on public.health_dispensations
  for each row execute function public.eps_health_dispense_institution();

create index if not exists health_dispense_institution_periode_idx
  on public.health_dispensations (institution_id, end_date desc, start_date desc)
  where deleted = false;

-- Lecture : toutes les dispenses du meme etablissement. Le repli par user_id garde visibles les
-- rares anciennes lignes qui ne peuvent pas encore etre rattachees.
drop policy if exists health_dispensations_read on public.health_dispensations;
create policy health_dispensations_read on public.health_dispensations
  for select to authenticated
  using (
    eps_account_active()
    and (
      user_id = auth.uid()
      or institution_id = eps_institution()
      or (institution_id is null and eps_institution(user_id) = eps_institution())
    )
  );

-- Ecriture : chaque professeur conserve la main uniquement sur ses propres saisies, dans son
-- etablissement. Le trigger ci-dessus renseigne institution_id avant ce controle.
drop policy if exists health_dispensations_insert on public.health_dispensations;
create policy health_dispensations_insert on public.health_dispensations
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and eps_account_active()
    and institution_id = eps_institution()
  );

drop policy if exists health_dispensations_update on public.health_dispensations;
create policy health_dispensations_update on public.health_dispensations
  for update to authenticated
  using (user_id = auth.uid() and eps_account_active())
  with check (
    user_id = auth.uid()
    and eps_account_active()
    and institution_id = eps_institution()
  );

drop policy if exists health_dispensations_delete on public.health_dispensations;
create policy health_dispensations_delete on public.health_dispensations
  for delete to authenticated
  using (user_id = auth.uid() and eps_account_active());

insert into public.eps_schema_marks (name) values ('sante_7')
  on conflict (name) do update set applied_at = now();

analyze public.health_dispensations;
commit;

-- Verification : aucune ligne ne doit rester sans etablissement dans l'equipe active.
-- select institution_id, count(*) from public.health_dispensations
--  where deleted = false group by institution_id order by institution_id nulls first;
