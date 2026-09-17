-- Droits du nouveau fonctionnement AS centre sur le creneau.
-- Idempotent : ce fichier peut etre relance sans dupliquer de donnees.
begin;

create or replace function public.eps_read_slot(p_slot text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.unss_slots s
    where s.id=p_slot and not s.deleted and eps_account_active()
      and (s.institution_id=eps_institution()
           or (s.institution_id is null and s.user_id=auth.uid()))
  );
$$;

create or replace function public.eps_manage_slot(p_slot text)
returns boolean language sql stable security definer set search_path=public as $$
  -- Les creneaux AS sont partages dans l'etablissement : tout professeur actif de la meme
  -- equipe peut y inscrire un eleve et realiser l'appel.
  select public.eps_read_slot(p_slot);
$$;

revoke all on function public.eps_read_slot(text),public.eps_manage_slot(text) from public;
grant execute on function public.eps_read_slot(text),public.eps_manage_slot(text) to authenticated;

drop policy if exists "select own unss memberships" on public.unss_memberships;
drop policy if exists "insert own unss memberships" on public.unss_memberships;
drop policy if exists "update own unss memberships" on public.unss_memberships;
drop policy if exists "delete own unss memberships" on public.unss_memberships;
drop policy if exists eps_member_read on public.unss_memberships;
drop policy if exists eps_member_create on public.unss_memberships;
drop policy if exists eps_member_update on public.unss_memberships;
drop policy if exists eps_member_delete on public.unss_memberships;
create policy eps_member_read on public.unss_memberships for select to authenticated
  using((slot_id is not null and eps_read_slot(slot_id))
     or (slot_id is null and group_id is not null and eps_read_group(group_id)));
create policy eps_member_create on public.unss_memberships for insert to authenticated
  with check(user_id=auth.uid() and ((slot_id is not null and eps_manage_slot(slot_id))
     or (slot_id is null and group_id is not null and eps_manage_group(group_id))));
create policy eps_member_update on public.unss_memberships for update to authenticated
  using((slot_id is not null and eps_manage_slot(slot_id))
     or (slot_id is null and group_id is not null and eps_manage_group(group_id)))
  with check((slot_id is not null and eps_manage_slot(slot_id))
     or (slot_id is null and group_id is not null and eps_manage_group(group_id)));
create policy eps_member_delete on public.unss_memberships for delete to authenticated
  using((slot_id is not null and eps_manage_slot(slot_id))
     or (slot_id is null and group_id is not null and eps_manage_group(group_id)));

drop policy if exists "select own unss sessions" on public.unss_sessions;
drop policy if exists "insert own unss sessions" on public.unss_sessions;
drop policy if exists "delete own unss sessions" on public.unss_sessions;
drop policy if exists eps_call_read on public.unss_sessions;
drop policy if exists eps_call_create on public.unss_sessions;
drop policy if exists eps_call_update on public.unss_sessions;
drop policy if exists eps_session_read on public.unss_sessions;
drop policy if exists eps_session_create on public.unss_sessions;
drop policy if exists eps_session_update on public.unss_sessions;
drop policy if exists eps_session_delete on public.unss_sessions;
create policy eps_session_read on public.unss_sessions for select to authenticated
  using((slot_id is not null and eps_read_slot(slot_id))
     or (slot_id is null and group_id is not null and eps_read_group(group_id)));
create policy eps_session_create on public.unss_sessions for insert to authenticated
  with check(user_id=auth.uid() and ((slot_id is not null and eps_manage_slot(slot_id))
     or (slot_id is null and group_id is not null and eps_manage_group(group_id))));
create policy eps_session_update on public.unss_sessions for update to authenticated
  using((slot_id is not null and eps_manage_slot(slot_id))
     or (slot_id is null and group_id is not null and eps_write_call(id)))
  with check((slot_id is not null and eps_manage_slot(slot_id))
     or (slot_id is null and group_id is not null and eps_write_call(id)));
create policy eps_session_delete on public.unss_sessions for delete to authenticated
  using((slot_id is not null and eps_manage_slot(slot_id))
     or (slot_id is null and group_id is not null and eps_write_call(id)));

drop policy if exists "select own unss attendance" on public.unss_attendance;
drop policy if exists "insert own unss attendance" on public.unss_attendance;
drop policy if exists "delete own unss attendance" on public.unss_attendance;
drop policy if exists eps_attendance_read on public.unss_attendance;
drop policy if exists eps_attendance_create on public.unss_attendance;
drop policy if exists eps_attendance_update on public.unss_attendance;
drop policy if exists eps_attendance_write on public.unss_attendance;
drop policy if exists eps_attendance_delete on public.unss_attendance;
create policy eps_attendance_read on public.unss_attendance for select to authenticated
  using(exists(select 1 from public.unss_sessions s where s.id=session_id
    and ((s.slot_id is not null and eps_read_slot(s.slot_id))
      or (s.slot_id is null and s.group_id is not null and eps_read_group(s.group_id)))));
create policy eps_attendance_create on public.unss_attendance for insert to authenticated
  with check(user_id=auth.uid() and exists(select 1 from public.unss_sessions s where s.id=session_id
    and ((s.slot_id is not null and eps_manage_slot(s.slot_id))
      or (s.slot_id is null and s.group_id is not null and eps_write_call(s.id)))));
create policy eps_attendance_update on public.unss_attendance for update to authenticated
  using(exists(select 1 from public.unss_sessions s where s.id=session_id
    and ((s.slot_id is not null and eps_manage_slot(s.slot_id))
      or (s.slot_id is null and s.group_id is not null and eps_write_call(s.id)))))
  with check(exists(select 1 from public.unss_sessions s where s.id=session_id
    and ((s.slot_id is not null and eps_manage_slot(s.slot_id))
      or (s.slot_id is null and s.group_id is not null and eps_write_call(s.id)))));
create policy eps_attendance_delete on public.unss_attendance for delete to authenticated
  using(exists(select 1 from public.unss_sessions s where s.id=session_id
    and ((s.slot_id is not null and eps_manage_slot(s.slot_id))
      or (s.slot_id is null and s.group_id is not null and eps_write_call(s.id)))));

-- Les politiques restrictives de securite du compte restent en place ; on ne les supprime pas.
insert into public.eps_schema_marks(name) values('as_creneaux_droits')
on conflict(name) do update set applied_at=now();

commit;
