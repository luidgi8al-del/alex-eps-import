-- RECETTE UNIQUEMENT : nécessite l'adaptation coordonnée des clients AS.
begin;

create table if not exists public.eps_revoked_accounts (
  user_id uuid primary key, revoked_at timestamptz not null default now(),
  institution_id uuid not null references public.institutions(id),
  requested_by uuid not null, auth_deleted boolean not null default false
);
alter table public.eps_revoked_accounts enable row level security;
revoke all on public.eps_revoked_accounts from anon, authenticated;

create or replace function public.eps_account_active(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select p_user is not null and exists(select 1 from auth.users where id=p_user)
    and not exists(select 1 from eps_revoked_accounts where user_id=p_user);
$$;
create or replace function public.eps_institution(p_user uuid default auth.uid())
returns uuid language sql stable security definer set search_path=public as $$
  select institution_id from profiles where id=p_user and eps_account_active(p_user);
$$;
create or replace function public.eps_is_admin(p_institution uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select eps_account_active() and exists(select 1 from institutions where id=p_institution
    and created_by=auth.uid() and id=eps_institution());
$$;
create or replace function public.eps_session_access()
returns boolean language sql stable security definer set search_path=public as $$
  select eps_account_active();
$$;
create or replace function public.eps_team_context()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('active',eps_account_active(),'institution_id',eps_institution(),
    'is_admin',coalesce(eps_is_admin(eps_institution()),false),
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'email',p.email,
       'name',coalesce(t.profile->>'teacherName',p.email,'')))
       from profiles p left join teacher_profiles t on t.user_id=p.id
       where p.institution_id=eps_institution() and eps_account_active(p.id)), '[]'::jsonb));
$$;

-- Direct edits of profiles would otherwise allow joining a school without its code.
revoke insert,update,delete on public.profiles from authenticated,anon;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='profiles' loop
    execute format('drop policy %I on public.profiles',p.policyname);
  end loop;
end $$;
create policy eps_profiles_visible on public.profiles for select to authenticated
using(eps_account_active() and (id=auth.uid() or institution_id=eps_institution()));

-- Shared rows keep a stable institution even if their original author leaves.
do $$ declare t text; begin
  foreach t in array array['unss_students','sport_installations','equipment','equipment_purchases',
    'epi_items','epi_inspections','institution_calendar_events','official_programs','unss_groups'] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I add column if not exists institution_id uuid references public.institutions(id)',t);
      execute format('update public.%I x set institution_id=p.institution_id from public.profiles p where x.user_id=p.id and x.institution_id is null',t);
    end if;
  end loop;
end $$;

alter table public.unss_groups add column if not exists assigned_teacher_id uuid references auth.users(id) on delete set null;
update public.unss_groups set assigned_teacher_id=user_id where assigned_teacher_id is null;
alter table public.unss_groups add column if not exists revision bigint not null default 1;
alter table public.unss_sessions add column if not exists author_id uuid;
alter table public.unss_sessions add column if not exists author_name text not null default '';
alter table public.unss_sessions add column if not exists locked boolean not null default false;
update public.unss_sessions s set author_id=s.user_id,author_name=coalesce(t.profile->>'teacherName',p.email,'Professeur')
from public.profiles p left join public.teacher_profiles t on t.user_id=p.id where s.user_id=p.id and s.author_id is null;

-- Historical roster snapshots outlive private classes. No private-class read access is granted.
alter table public.unss_memberships add column if not exists student_last_name text not null default '';
alter table public.unss_memberships add column if not exists student_first_name text not null default '';
alter table public.unss_attendance add column if not exists student_last_name text not null default '';
alter table public.unss_attendance add column if not exists student_first_name text not null default '';
update public.unss_memberships m set student_last_name=s.last_name,student_first_name=s.first_name
from public.students s where m.student_id=s.id and m.student_last_name='';
update public.unss_attendance m set student_last_name=s.last_name,student_first_name=s.first_name
from public.students s where m.student_id=s.id and m.student_last_name='';
do $$ declare fk record; begin
  for fk in select conrelid::regclass as tab,conname from pg_constraint
    where contype='f' and confrelid='public.students'::regclass
    and conrelid in ('public.unss_memberships'::regclass,'public.unss_attendance'::regclass) loop
    execute format('alter table %s drop constraint %I',fk.tab,fk.conname);
  end loop;
end $$;

create table if not exists public.eps_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id text references public.unss_groups(id) on delete cascade,
  message text not null,created_at timestamptz not null default now(),read_at timestamptz
);
alter table public.eps_notifications enable row level security;
revoke all on public.eps_notifications from anon,authenticated;
grant select on public.eps_notifications to authenticated;
grant update(read_at) on public.eps_notifications to authenticated;
drop policy if exists eps_notice_read on public.eps_notifications;
drop policy if exists eps_notice_ack on public.eps_notifications;
create policy eps_notice_read on public.eps_notifications for select to authenticated using(user_id=auth.uid() and eps_account_active());
create policy eps_notice_ack on public.eps_notifications for update to authenticated using(user_id=auth.uid() and eps_account_active()) with check(user_id=auth.uid());

create or replace function public.eps_manage_group(p_group text)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from unss_groups g where g.id=p_group and g.institution_id=eps_institution()
   and not g.deleted and eps_account_active() and (eps_is_admin(g.institution_id) or g.assigned_teacher_id=auth.uid()));
$$;
create or replace function public.eps_read_group(p_group text)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from unss_groups g where g.id=p_group and g.institution_id=eps_institution() and eps_account_active());
$$;
create or replace function public.eps_write_call(p_session text)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from unss_sessions s join unss_groups g on g.id=s.group_id
   where s.id=p_session and s.author_id=auth.uid() and not s.locked and not g.deleted
   and g.assigned_teacher_id=auth.uid() and g.institution_id=eps_institution() and eps_account_active());
$$;

-- All older permissive policies on these explicitly scoped tables are replaced.
do $$ declare t text;p record;shared boolean;planning boolean; begin
 foreach t in array array['classes','students','cycles','evaluations','evaluation_criteria','evaluation_scores',
   'class_schedule_slots','period_activities','annual_plan_blocks','unss_students','sport_installations',
   'equipment','equipment_purchases','epi_items','epi_inspections','institution_calendar_events','official_programs'] loop
  if to_regclass('public.'||t) is not null then
   for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
     execute format('drop policy %I on public.%I',p.policyname,t);
   end loop;
   shared=t=any(array['unss_students','sport_installations','equipment','equipment_purchases','epi_items','epi_inspections','institution_calendar_events','official_programs']);
   planning=t=any(array['class_schedule_slots','period_activities','annual_plan_blocks']);
   execute format('alter table public.%I enable row level security',t);
   execute format('create policy eps_read on public.%I for select to authenticated using(eps_account_active() and (%s))',t,
     case when shared then 'institution_id=eps_institution() or (institution_id is null and user_id=auth.uid())'
       when planning then 'user_id=auth.uid() or eps_institution(user_id)=eps_institution()' else 'user_id=auth.uid()' end);
   execute format('create policy eps_insert on public.%I for insert to authenticated with check(eps_account_active() and user_id=auth.uid() %s)',t,
     case when shared then 'and (institution_id=eps_institution() or (institution_id is null and eps_institution() is null))' else '' end);
   execute format('create policy eps_update on public.%I for update to authenticated using(eps_account_active() and (%s)) with check(eps_account_active() and (%s))',t,
     case when shared then 'institution_id=eps_institution() or (institution_id is null and user_id=auth.uid())' else 'user_id=auth.uid()' end,
     case when shared then 'institution_id=eps_institution() or (institution_id is null and user_id=auth.uid())' else 'user_id=auth.uid()' end);
   execute format('create policy eps_delete on public.%I for delete to authenticated using(eps_account_active() and (%s))',t,
     case when shared then 'institution_id=eps_institution() or (institution_id is null and user_id=auth.uid())' else 'user_id=auth.uid()' end);
  end if;
 end loop;
end $$;

create or replace function public.eps_shared_identity_guard()
returns trigger language plpgsql set search_path=public as $$
begin
 if current_user in ('postgres','supabase_admin','service_role') then return new; end if;
 if tg_op='INSERT' then new.institution_id=eps_institution();new.user_id=auth.uid();
 elsif new.institution_id is distinct from old.institution_id or new.user_id is distinct from old.user_id then
   raise exception 'Shared ownership is immutable';
 end if;
 return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['unss_students','sport_installations','equipment','equipment_purchases','epi_items','epi_inspections','institution_calendar_events','official_programs','unss_groups'] loop
  if to_regclass('public.'||t) is not null then
   execute format('drop trigger if exists eps_shared_identity on public.%I',t);
   execute format('create trigger eps_shared_identity before insert or update on public.%I for each row execute function eps_shared_identity_guard()',t);
  end if;
 end loop;
end $$;

do $$ declare t text;p record; begin
 foreach t in array array['unss_groups','unss_memberships','unss_sessions','unss_attendance'] loop
  for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
   execute format('drop policy %I on public.%I',p.policyname,t);
  end loop;
 end loop;
end $$;
create policy eps_group_read on public.unss_groups for select to authenticated using(eps_read_group(id));
create policy eps_group_create on public.unss_groups for insert to authenticated with check(eps_is_admin(institution_id) and user_id=auth.uid());
create policy eps_group_update on public.unss_groups for update to authenticated using(eps_manage_group(id)) with check(eps_manage_group(id));
create policy eps_member_read on public.unss_memberships for select to authenticated using(eps_read_group(group_id));
create policy eps_member_create on public.unss_memberships for insert to authenticated with check(eps_manage_group(group_id) and user_id=auth.uid());
create policy eps_member_update on public.unss_memberships for update to authenticated using(eps_manage_group(group_id)) with check(eps_manage_group(group_id));
create policy eps_member_delete on public.unss_memberships for delete to authenticated using(eps_manage_group(group_id));
create policy eps_call_read on public.unss_sessions for select to authenticated using(eps_read_group(group_id));
create policy eps_call_create on public.unss_sessions for insert to authenticated with check(eps_write_call(id));
-- Creation checked by trigger below (new row is not visible to eps_write_call before insertion).
drop policy eps_call_create on public.unss_sessions;
create policy eps_call_create on public.unss_sessions for insert to authenticated with check(author_id=auth.uid() and user_id=auth.uid() and eps_manage_group(group_id));
create policy eps_call_update on public.unss_sessions for update to authenticated using(eps_write_call(id)) with check(eps_write_call(id));
create policy eps_attendance_read on public.unss_attendance for select to authenticated using(exists(select 1 from unss_sessions s where s.id=session_id and eps_read_group(s.group_id)));
create policy eps_attendance_create on public.unss_attendance for insert to authenticated with check(eps_write_call(session_id) and user_id=auth.uid());
create policy eps_attendance_update on public.unss_attendance for update to authenticated using(eps_write_call(session_id)) with check(eps_write_call(session_id));

create or replace function public.eps_group_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if auth.role()='service_role' or auth.uid() is null then return new; end if;
 if tg_op='INSERT' or new.assigned_teacher_id is distinct from old.assigned_teacher_id then
   if not eps_is_admin(new.institution_id) then raise exception 'Administrator required'; end if;
   if new.assigned_teacher_id is null or eps_institution(new.assigned_teacher_id) is distinct from new.institution_id then raise exception 'Teacher outside institution'; end if;
   select coalesce(t.profile->>'teacherName',p.email,'Professeur') into new.responsible_teacher
     from profiles p left join teacher_profiles t on t.user_id=p.id where p.id=new.assigned_teacher_id;
   insert into eps_notifications(user_id,group_id,message) values(new.assigned_teacher_id,null,'Un groupe AS vous est attribué : '||new.activity_name);
 end if;
 if tg_op='UPDATE' then new.revision=old.revision+1; end if;
 new.updated_at=now(); return new;
end $$;
drop trigger if exists eps_group_guard on public.unss_groups;
create trigger eps_group_guard before insert or update on public.unss_groups for each row execute function public.eps_group_guard();

create or replace function public.eps_call_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if auth.role()='service_role' or auth.uid() is null then return new; end if;
 if tg_op='INSERT' then
  if not exists(select 1 from unss_groups where id=new.group_id and assigned_teacher_id=auth.uid() and institution_id=eps_institution() and not deleted) then raise exception 'Assigned teacher required'; end if;
  new.author_id=auth.uid();new.user_id=auth.uid();new.locked=false;
  select coalesce(profile->>'teacherName','Professeur') into new.author_name from teacher_profiles where user_id=auth.uid();
  new.author_name=coalesce(new.author_name,'Professeur');
 elsif new.author_id is distinct from old.author_id or new.group_id<>old.group_id or new.user_id<>old.user_id or new.locked<>old.locked or new.author_name<>old.author_name then
  raise exception 'Call authorship is immutable';
 end if;
 new.updated_at=now(); return new;
end $$;
drop trigger if exists eps_call_guard on public.unss_sessions;
create trigger eps_call_guard before insert or update on public.unss_sessions for each row execute function public.eps_call_guard();

-- Defense against unexpired JWTs after deletion, including legacy tables/policies.
do $$ declare t record;begin
 for t in select tablename from pg_tables where schemaname='public' and tablename not in ('eps_revoked_accounts') loop
  execute format('drop policy if exists eps_active_account on public.%I',t.tablename);
  execute format('create policy eps_active_account on public.%I as restrictive for all to authenticated using(eps_account_active()) with check(eps_account_active())',t.tablename);
 end loop;
end $$;

revoke all on function public.eps_account_active(uuid),public.eps_institution(uuid),public.eps_is_admin(uuid),public.eps_session_access(),public.eps_team_context(),public.eps_manage_group(text),public.eps_read_group(text),public.eps_write_call(text) from public;
grant execute on function public.eps_account_active(uuid),public.eps_institution(uuid),public.eps_is_admin(uuid),public.eps_session_access(),public.eps_team_context(),public.eps_manage_group(text),public.eps_read_group(text),public.eps_write_call(text) to authenticated;
commit;
