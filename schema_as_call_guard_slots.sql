-- Correctif des appels AS créés depuis un créneau.
-- À exécuter une fois dans l’éditeur SQL Supabase.
begin;

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

insert into public.eps_schema_marks(name) values('as_call_guard_slots')
on conflict(name) do update set applied_at=now();

commit;
