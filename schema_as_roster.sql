-- Séparation AS/classes privées. À exécuter avant les clients utilisant le répertoire AS.
-- Sauvegarde recommandée. Les anciennes inscriptions et présences sont conservées.
begin;
insert into public.unss_students(id,user_id,last_name,first_name,birth_date_epoch_millis,student_email,parent_email,updated_at)
select 'as-legacy-'||s.id,s.user_id,s.last_name,s.first_name,s.birth_date_epoch_millis,s.student_email,coalesce(s.parent1_email,s.parent2_email),s.updated_at
from public.students s
where s.id in(select student_id from public.unss_memberships union select student_id from public.unss_attendance)
on conflict(id) do nothing;

-- Remove only obsolete foreign keys targeting private students, never group/session links.
do $$ declare fk record;begin
 for fk in select conrelid::regclass as tab,conname from pg_constraint where contype='f'
   and confrelid='public.students'::regclass and conrelid in('public.unss_memberships'::regclass,'public.unss_attendance'::regclass) loop
  execute format('alter table %s drop constraint %I',fk.tab,fk.conname);
 end loop;
end $$;
update public.unss_memberships m set student_id='as-legacy-'||m.student_id
where exists(select 1 from public.students s where s.id=m.student_id)
and not exists(select 1 from public.unss_students a where a.id=m.student_id);
update public.unss_attendance m set student_id='as-legacy-'||m.student_id
where exists(select 1 from public.students s where s.id=m.student_id)
and not exists(select 1 from public.unss_students a where a.id=m.student_id);
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.unss_memberships'::regclass and conname='as_membership_directory_fk') then
  alter table public.unss_memberships add constraint as_membership_directory_fk foreign key(student_id) references public.unss_students(id) on delete restrict;
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.unss_attendance'::regclass and conname='as_attendance_directory_fk') then
  alter table public.unss_attendance add constraint as_attendance_directory_fk foreign key(student_id) references public.unss_students(id) on delete restrict;
 end if;
end $$;
create or replace function public.eps_as_roster_version() returns integer language sql stable as $$ select 2; $$;
revoke all on function public.eps_as_roster_version() from public;
grant execute on function public.eps_as_roster_version() to authenticated;
commit;
