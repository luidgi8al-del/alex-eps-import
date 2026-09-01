-- RECETTE UNIQUEMENT. Fonctions appelables uniquement par le service serveur.
begin;
create table if not exists public.eps_teacher_invites (
 id uuid primary key default gen_random_uuid(), institution_id uuid not null references public.institutions(id),
 email text not null, display_name text not null, invited_by uuid not null,
 created_at timestamptz not null default now(), claimed_by uuid, unique(institution_id,email)
);
alter table public.eps_teacher_invites enable row level security;
revoke all on public.eps_teacher_invites from anon,authenticated;

create or replace function public.eps_admin_target(p_actor uuid,p_target uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare inst institutions; target_profile profiles;
begin
 if auth.role()<>'service_role' then raise exception 'Server only';end if;
 select i.* into inst from institutions i join profiles p on p.institution_id=i.id where p.id=p_actor and i.created_by=p_actor for update of i;
 if inst.id is null or not eps_account_active(p_actor) then raise exception 'Administrator required';end if;
 if p_target is not null then
  select * into target_profile from profiles where id=p_target;
  if target_profile.institution_id is distinct from inst.id then
   if not exists(select 1 from eps_revoked_accounts where user_id=p_target and institution_id=inst.id and requested_by=p_actor) then raise exception 'Teacher outside institution'; end if;
  end if;
  if p_target=p_actor then raise exception 'Cannot remove or reset self here';end if;
 end if;
 return jsonb_build_object('institution_id',inst.id,'email',target_profile.email);
end $$;

create or replace function public.eps_reserve_invite(p_actor uuid,p_email text,p_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare ctx jsonb; invite_id uuid;
begin
 ctx=eps_admin_target(p_actor);
 if length(trim(p_email))>254 or trim(p_email) not like '%_@_%._%' or trim(p_name)='' then raise exception 'Name and email required';end if;
 if exists(select 1 from auth.users where lower(email)=lower(trim(p_email))) then raise exception 'Account already exists. Use password reset for an existing colleague, or the school joining code.';end if;
 insert into eps_teacher_invites(institution_id,email,display_name,invited_by)
 values((ctx->>'institution_id')::uuid,lower(trim(p_email)),trim(p_name),p_actor)
 on conflict(institution_id,email) do update set display_name=excluded.display_name,created_at=now()
 returning id into invite_id;
 return invite_id;
end $$;

-- Reservation made by the authenticated admin, not untrusted signup metadata.
create or replace function public.eps_claim_reserved_invite()
returns trigger language plpgsql security definer set search_path=public as $$
declare invitation eps_teacher_invites;
begin
 select * into invitation from eps_teacher_invites where email=lower(new.email) and claimed_by is null
 and created_at>now()-interval '7 days' order by created_at desc limit 1 for update;
 if invitation.id is not null and eps_account_active(invitation.invited_by)
 and exists(select 1 from institutions where id=invitation.institution_id and created_by=invitation.invited_by) then
  insert into profiles(id,institution_id,email) values(new.id,invitation.institution_id,new.email)
  on conflict(id) do update set institution_id=excluded.institution_id,email=excluded.email;
  insert into teacher_profiles(user_id,profile) values(new.id,jsonb_build_object('teacherName',invitation.display_name,'proEmail',new.email,'schoolYear','2026-2027','interactiveHomeEnabled','false'))
  on conflict(user_id) do nothing;
  update eps_teacher_invites set claimed_by=new.id where id=invitation.id;
 end if;
 return new;
end $$;
drop trigger if exists eps_claim_reserved_invite on auth.users;
create trigger eps_claim_reserved_invite after insert on auth.users for each row execute function public.eps_claim_reserved_invite();

create or replace function public.eps_prepare_remove_teacher(p_actor uuid,p_target uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ctx jsonb;inst uuid;t text;groups_kept int;calls_kept int;
begin
 ctx=eps_admin_target(p_actor,p_target);inst=(ctx->>'institution_id')::uuid;
 -- Do not delete another school accidentally through created_by CASCADE.
 if exists(select 1 from institutions where created_by=p_target) then raise exception 'Transfer institution ownership before deleting this account';end if;
 insert into eps_revoked_accounts(user_id,institution_id,requested_by) values(p_target,inst,p_actor) on conflict(user_id) do nothing;
 -- A blocked account cannot re-upload, even while auth deletion is retried.
 select count(*) into groups_kept from unss_groups where assigned_teacher_id=p_target and institution_id=inst;
 select count(*) into calls_kept from unss_sessions where author_id=p_target;
 update unss_groups set assigned_teacher_id=p_actor,responsible_teacher=coalesce((select profile->>'teacherName' from teacher_profiles where user_id=p_actor),'Administrateur'),revision=revision+1,updated_at=now()
 where assigned_teacher_id=p_target and institution_id=inst;
 update unss_sessions set locked=true where author_id=p_target;
 -- Roster snapshots are independent of students/classes after migration 001.
 foreach t in array array['unss_memberships','unss_sessions','unss_attendance','unss_groups',
   'unss_students','sport_installations','equipment','equipment_purchases','epi_items','epi_inspections','institution_calendar_events','official_programs'] loop
  if to_regclass('public.'||t) is not null then
   execute format('update public.%I set user_id=$1 where user_id=$2',t) using p_actor,p_target;
  end if;
 end loop;
 if to_regclass('public.planning_validations') is not null then update planning_validations set updated_by=p_actor where updated_by=p_target;end if;
 delete from eps_teacher_invites where claimed_by=p_target;
 insert into eps_notifications(user_id,message) values(p_actor,'Groupes du professeur supprimé conservés et réattribués. Les anciens appels sont en lecture seule.');
 -- Delete auth.users via Auth Admin API next; private rows cascade through their user FK.
 return jsonb_build_object('groups_preserved',groups_kept,'calls_preserved',calls_kept,'blocked',true);
end $$;
create or replace function public.eps_finish_remove_teacher(p_actor uuid,p_target uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform eps_admin_target(p_actor,p_target);
 if exists(select 1 from auth.users where id=p_target) then raise exception 'Auth account still exists';end if;
 update eps_revoked_accounts set auth_deleted=true where user_id=p_target and requested_by=p_actor;
end $$;

revoke all on function public.eps_admin_target(uuid,uuid),public.eps_reserve_invite(uuid,text,text),public.eps_prepare_remove_teacher(uuid,uuid),public.eps_finish_remove_teacher(uuid,uuid) from public,anon,authenticated;
grant execute on function public.eps_admin_target(uuid,uuid),public.eps_reserve_invite(uuid,text,text),public.eps_prepare_remove_teacher(uuid,uuid),public.eps_finish_remove_teacher(uuid,uuid) to service_role;
commit;
