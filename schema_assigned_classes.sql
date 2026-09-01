-- Classes attribuees a un collegue (preparation d'un compte avant son arrivee).
--
-- Objectif : un administrateur prepare la classe d'un collegue - la classe, ses eleves - avant
-- meme que celui-ci ait cree son mot de passe. A sa premiere connexion, tout est deja la.
--
-- Ce fichier reprend exactement le modele deja en place pour les groupes AS
-- (unss_groups.assigned_teacher_id) : l'administrateur cree et attribue, le professeur attribue
-- modifie. Personne ne se connecte a la place de personne, et chaque ligne garde la trace de qui
-- l'a creee (user_id) et de qui elle releve (assigned_teacher_id).

alter table classes add column if not exists assigned_teacher_id uuid references auth.users(id) on delete set null;
create index if not exists classes_assigned_idx on classes(assigned_teacher_id);

-- ---------------------------------------------------------------------------
-- Qui accede a une classe : son proprietaire, ou le professeur a qui elle est attribuee.
-- ---------------------------------------------------------------------------

create or replace function public.eps_can_access_class(p_class text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from classes c
    where c.id = p_class
      and eps_account_active()
      and (c.user_id = auth.uid() or c.assigned_teacher_id = auth.uid())
  );
$$;
grant execute on function public.eps_can_access_class(text) to authenticated;

drop policy if exists eps_read on classes;
drop policy if exists eps_update on classes;
drop policy if exists eps_delete on classes;

create policy eps_read on classes for select to authenticated
  using (eps_account_active() and (user_id = auth.uid() or assigned_teacher_id = auth.uid()));
create policy eps_update on classes for update to authenticated
  using (eps_account_active() and (user_id = auth.uid() or assigned_teacher_id = auth.uid()))
  with check (eps_account_active() and (user_id = auth.uid() or assigned_teacher_id = auth.uid()));
-- La suppression reste au proprietaire : le professeur attribue modifie sa classe, il ne
-- supprime pas le travail de preparation de l'administrateur.
create policy eps_delete on classes for delete to authenticated
  using (eps_account_active() and user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Les eleves suivent leur classe : sans cela, le collegue verrait une classe vide.
-- ---------------------------------------------------------------------------

drop policy if exists eps_read on students;
drop policy if exists eps_insert on students;
drop policy if exists eps_update on students;
drop policy if exists eps_delete on students;

create policy eps_read on students for select to authenticated
  using (eps_account_active() and (user_id = auth.uid() or eps_can_access_class(class_id)));
-- Inchangee volontairement : y ajouter une contrainte sur la classe ferait echouer la
-- synchronisation d'un eleve dont la classe n'est pas encore remontee.
create policy eps_insert on students for insert to authenticated
  with check (eps_account_active() and user_id = auth.uid());
create policy eps_update on students for update to authenticated
  using (eps_account_active() and (user_id = auth.uid() or eps_can_access_class(class_id)))
  with check (eps_account_active() and (user_id = auth.uid() or eps_can_access_class(class_id)));
create policy eps_delete on students for delete to authenticated
  using (eps_account_active() and (user_id = auth.uid() or eps_can_access_class(class_id)));

-- ---------------------------------------------------------------------------
-- Garde-fou : seul un administrateur attribue, et seulement a un membre de son etablissement.
-- Sans cela, n'importe qui pourrait s'attribuer la classe d'un collegue en modifiant une ligne.
-- ---------------------------------------------------------------------------

create or replace function public.eps_class_assignment_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.role() = 'service_role' or auth.uid() is null then return new; end if;

  if tg_op = 'INSERT' then
    if new.assigned_teacher_id is not null and new.assigned_teacher_id <> auth.uid() then
      if not eps_is_admin(eps_institution()) then raise exception 'Administrateur requis pour attribuer une classe'; end if;
      if eps_institution(new.assigned_teacher_id) is distinct from eps_institution() then
        raise exception 'Ce professeur n''est pas dans votre etablissement';
      end if;
    end if;
  elsif new.assigned_teacher_id is distinct from old.assigned_teacher_id then
    if not eps_is_admin(eps_institution()) then raise exception 'Administrateur requis pour attribuer une classe'; end if;
    if new.assigned_teacher_id is not null
       and eps_institution(new.assigned_teacher_id) is distinct from eps_institution() then
      raise exception 'Ce professeur n''est pas dans votre etablissement';
    end if;
    -- Le proprietaire d'une classe ne change jamais : c'est la trace de qui l'a preparee.
    if new.user_id is distinct from old.user_id then raise exception 'Le proprietaire d''une classe est immuable'; end if;
  end if;

  -- On ne touche pas a updated_at : c'est la date envoyee par le client qui arbitre les
  -- conflits de synchronisation. La remplacer par now() ferait gagner le serveur a chaque
  -- fois, et une modification faite sur le telephone entre deux echanges serait perdue.
  return new;
end $$;

drop trigger if exists eps_class_assignment on classes;
create trigger eps_class_assignment before insert or update on classes
  for each row execute function public.eps_class_assignment_guard();

-- ---------------------------------------------------------------------------
-- Notification, comme pour un groupe AS attribue : le collegue doit savoir ce qui l'attend.
-- ---------------------------------------------------------------------------

create or replace function public.eps_class_assignment_notice()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  -- old n'existe pas dans un declencheur d'insertion : y acceder ferait echouer toute creation
  -- de classe. On distingue donc explicitement les deux operations.
  if new.assigned_teacher_id is not null
     and new.assigned_teacher_id <> new.user_id
     and (tg_op = 'INSERT' or new.assigned_teacher_id is distinct from old.assigned_teacher_id) then
    insert into eps_notifications(user_id, group_id, message)
    values (new.assigned_teacher_id, null, 'Une classe vous est attribuee : ' || new.name);
  end if;
  return new;
end $$;

drop trigger if exists eps_class_assignment_notice on classes;
create trigger eps_class_assignment_notice after insert or update on classes
  for each row execute function public.eps_class_assignment_notice();
