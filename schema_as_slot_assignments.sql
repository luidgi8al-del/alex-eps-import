-- Affectation nominative des créneaux AS aux comptes professeurs.
-- À exécuter une fois dans l'éditeur SQL Supabase.
begin;

alter table public.unss_slots
  add column if not exists assigned_teacher_id uuid references auth.users(id) on delete set null;
create index if not exists unss_slots_assigned_teacher_idx
  on public.unss_slots(assigned_teacher_id) where not deleted;

-- Reprend autant que possible les responsables déjà saisis sous forme de texte.
update public.unss_slots s
set assigned_teacher_id = p.id
from public.profiles p
left join public.teacher_profiles t on t.user_id = p.id
where s.assigned_teacher_id is null
  and p.institution_id = s.institution_id
  and lower(trim(s.responsible_teacher)) in
      (lower(trim(p.email)), lower(trim(coalesce(t.profile->>'teacherName',''))));

create or replace function public.eps_call_slot(p_slot text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.unss_slots s
    where s.id=p_slot and not s.deleted and eps_account_active()
      and s.institution_id=eps_institution()
      and s.assigned_teacher_id=auth.uid());
$$;
revoke all on function public.eps_call_slot(text) from public;
grant execute on function public.eps_call_slot(text) to authenticated;

create or replace function public.eps_slot_assignment_guard()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_name text;
begin
  if auth.uid() is null or current_user in ('postgres','supabase_admin','service_role') then return new; end if;
  if tg_op='INSERT' or new.assigned_teacher_id is distinct from old.assigned_teacher_id then
    if new.assigned_teacher_id is null then
      new.responsible_teacher='';
      return new;
    end if;
    if eps_institution(new.assigned_teacher_id) is distinct from eps_institution() then
      raise exception 'Professeur hors établissement';
    end if;
    if new.assigned_teacher_id <> auth.uid() and not eps_is_admin(eps_institution()) then
      raise exception 'Administrateur requis pour affecter un autre professeur';
    end if;
    select coalesce(t.profile->>'teacherName',p.email,'Professeur') into v_name
      from public.profiles p left join public.teacher_profiles t on t.user_id=p.id
      where p.id=new.assigned_teacher_id;
    new.responsible_teacher=coalesce(v_name,'Professeur');
  end if;
  return new;
end $$;
drop trigger if exists eps_slot_assignment_guard on public.unss_slots;
create trigger eps_slot_assignment_guard before insert or update on public.unss_slots
  for each row execute function public.eps_slot_assignment_guard();

-- L'ancien garde-fou ne connaissait que les groupes AS. Une séance rattachée à un créneau
-- possédait donc bien slot_id, mais group_id était vide et le trigger répondait à tort
-- "Assigned teacher required" avant même l'évaluation des politiques ci-dessous.
create or replace function public.eps_call_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.role()='service_role' or auth.uid() is null then return new; end if;
  if tg_op='INSERT' then
    if new.slot_id is not null then
      if not public.eps_call_slot(new.slot_id) then raise exception 'Assigned teacher required'; end if;
    elsif new.group_id is not null then
      if not exists(select 1 from public.unss_groups g where g.id=new.group_id
        and g.assigned_teacher_id=auth.uid() and g.institution_id=eps_institution() and not g.deleted)
      then raise exception 'Assigned teacher required'; end if;
    else
      raise exception 'Slot or group required';
    end if;
    new.author_id=auth.uid(); new.user_id=auth.uid(); new.locked=false;
    select coalesce(t.profile->>'teacherName',p.email,'Professeur') into new.author_name
      from public.profiles p left join public.teacher_profiles t on t.user_id=p.id
      where p.id=auth.uid();
    new.author_name=coalesce(new.author_name,'Professeur');
  elsif new.author_id is distinct from old.author_id
     or new.group_id is distinct from old.group_id
     or new.slot_id is distinct from old.slot_id
     or new.user_id is distinct from old.user_id
     or new.locked is distinct from old.locked
     or new.author_name is distinct from old.author_name then
    raise exception 'Call authorship is immutable';
  end if;
  new.updated_at=now(); return new;
end $$;
drop trigger if exists eps_call_guard on public.unss_sessions;
create trigger eps_call_guard before insert or update on public.unss_sessions
  for each row execute function public.eps_call_guard();

-- L'inscription reste gérable depuis l'organisation générale, mais appels et présences sont
-- réservés au professeur réellement affecté au créneau.
drop policy if exists eps_session_create on public.unss_sessions;
drop policy if exists eps_session_update on public.unss_sessions;
drop policy if exists eps_session_delete on public.unss_sessions;
create policy eps_session_create on public.unss_sessions for insert to authenticated
  with check(user_id=auth.uid() and ((slot_id is not null and eps_call_slot(slot_id))
    or (slot_id is null and group_id is not null and eps_manage_group(group_id))));
create policy eps_session_update on public.unss_sessions for update to authenticated
  using((slot_id is not null and eps_call_slot(slot_id))
    or (slot_id is null and group_id is not null and eps_write_call(id)))
  with check((slot_id is not null and eps_call_slot(slot_id))
    or (slot_id is null and group_id is not null and eps_write_call(id)));
create policy eps_session_delete on public.unss_sessions for delete to authenticated
  using((slot_id is not null and eps_call_slot(slot_id))
    or (slot_id is null and group_id is not null and eps_write_call(id)));

drop policy if exists eps_attendance_create on public.unss_attendance;
drop policy if exists eps_attendance_update on public.unss_attendance;
drop policy if exists eps_attendance_delete on public.unss_attendance;
create policy eps_attendance_create on public.unss_attendance for insert to authenticated
  with check(user_id=auth.uid() and exists(select 1 from public.unss_sessions s where s.id=session_id
    and ((s.slot_id is not null and eps_call_slot(s.slot_id))
      or (s.slot_id is null and s.group_id is not null and eps_write_call(s.id)))));
create policy eps_attendance_update on public.unss_attendance for update to authenticated
  using(exists(select 1 from public.unss_sessions s where s.id=session_id
    and ((s.slot_id is not null and eps_call_slot(s.slot_id))
      or (s.slot_id is null and s.group_id is not null and eps_write_call(s.id)))))
  with check(exists(select 1 from public.unss_sessions s where s.id=session_id
    and ((s.slot_id is not null and eps_call_slot(s.slot_id))
      or (s.slot_id is null and s.group_id is not null and eps_write_call(s.id)))));
create policy eps_attendance_delete on public.unss_attendance for delete to authenticated
  using(exists(select 1 from public.unss_sessions s where s.id=session_id
    and ((s.slot_id is not null and eps_call_slot(s.slot_id))
      or (s.slot_id is null and s.group_id is not null and eps_write_call(s.id)))));

insert into public.eps_schema_marks(name) values('as_slot_assignments')
on conflict(name) do update set applied_at=now();

commit;
