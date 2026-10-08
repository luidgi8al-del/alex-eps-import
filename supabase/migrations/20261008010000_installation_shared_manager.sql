-- Signalements communs à l'établissement et compte responsable dédié.
-- À exécuter après schema_team_administration_1.sql et la migration WhatsApp de 2026-09-28.
begin;

create table if not exists public.eps_installation_managers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  assigned_by uuid not null references auth.users(id),
  assigned_at timestamptz not null default now()
);
create index if not exists eps_installation_managers_institution_idx
  on public.eps_installation_managers(institution_id);
alter table public.eps_installation_managers enable row level security;
revoke all on public.eps_installation_managers from anon, authenticated;
grant select on public.eps_installation_managers to authenticated;
drop policy if exists eps_installation_managers_own on public.eps_installation_managers;
create policy eps_installation_managers_own on public.eps_installation_managers
  for select to authenticated using (user_id = auth.uid());

create or replace function public.eps_installation_scope()
returns uuid language sql stable security definer set search_path = public as $$
  select case when public.eps_account_active() then
    coalesce((select m.institution_id from public.eps_installation_managers m where m.user_id = auth.uid()),
             (select p.institution_id from public.profiles p where p.id = auth.uid()))
  end;
$$;

create or replace function public.eps_installation_manager_context()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'is_manager', exists(select 1 from public.eps_installation_managers m
      where m.user_id = auth.uid() and public.eps_account_active()),
    'institution_id', public.eps_installation_scope()
  );
$$;
revoke all on function public.eps_installation_manager_context() from public;
grant execute on function public.eps_installation_manager_context() to authenticated;

create or replace function public.eps_installation_delivery_ready()
returns boolean language sql stable security definer set search_path = public as $$
  select public.eps_account_active() and exists(
    select 1 from public.eps_installation_managers m
    where m.institution_id = public.eps_institution()
  );
$$;
revoke all on function public.eps_installation_delivery_ready() from public;
grant execute on function public.eps_installation_delivery_ready() to authenticated;

create or replace function public.eps_installation_facilities()
returns table(name text) language sql stable security definer set search_path = public as $$
  select distinct s.name from public.sport_installations s
    where s.institution_id = public.eps_installation_scope() and not s.deleted
    order by s.name;
$$;
revoke all on function public.eps_installation_facilities() from public;
grant execute on function public.eps_installation_facilities() to authenticated;

-- Seul le créateur de l'établissement peut attribuer ce rôle à un compte distinct.
-- Le compte responsable ne doit PAS rejoindre l'établissement comme professeur.
create or replace function public.eps_assign_installation_manager(p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  school uuid;
  target_user uuid;
begin
  school := public.eps_institution();
  if school is null or not public.eps_is_admin(school) then
    raise exception 'Droits administrateur nécessaires' using errcode = '42501';
  end if;
  select u.id into target_user from auth.users u
    where lower(u.email) = lower(trim(p_email)) and u.email_confirmed_at is not null;
  if target_user is null then
    raise exception 'Compte responsable introuvable ou adresse non confirmée';
  end if;
  if target_user = auth.uid() or exists(select 1 from public.profiles p
    where p.id = target_user and p.institution_id is not null) then
    raise exception 'Utilisez un compte responsable distinct des comptes professeur';
  end if;
  insert into public.eps_installation_managers(user_id, institution_id, assigned_by)
    values(target_user, school, auth.uid())
    on conflict(user_id) do update set institution_id = excluded.institution_id,
      assigned_by = excluded.assigned_by, assigned_at = now();
  return jsonb_build_object('email', trim(p_email), 'institution_id', school);
end;
$$;
revoke all on function public.eps_assign_installation_manager(text) from public;
grant execute on function public.eps_assign_installation_manager(text) to authenticated;

alter table public.sport_installation_incidents
  add column if not exists institution_id uuid references public.institutions(id);
update public.sport_installation_incidents i set institution_id = p.institution_id
  from public.profiles p where i.user_id = p.id and i.institution_id is null;
create index if not exists eps_installation_incidents_institution_idx
  on public.sport_installation_incidents(institution_id, reported_at desc);
alter table public.sport_installation_incidents
  alter column message_text set default '', alter column whatsapp_phone set default '';

create or replace function public.eps_installation_incident_scope()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.institution_id := public.eps_institution();
    if new.institution_id is null or new.user_id <> auth.uid() then
      raise exception 'Compte professeur non rattaché' using errcode = '42501';
    end if;
    if not exists(select 1 from public.sport_installations s
      where s.id = new.installation_id and s.institution_id = new.institution_id and not s.deleted) then
      raise exception 'Installation inconnue de cet établissement' using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' then
    -- Seuls les champs de prise en charge sont modifiables par le responsable.
    if new.id <> old.id or new.user_id <> old.user_id or
      new.institution_id is distinct from old.institution_id or
      new.installation_id <> old.installation_id or
      new.description <> old.description or new.urgency <> old.urgency then
      raise exception 'Seul le suivi peut être modifié' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists eps_installation_incident_scope_trigger on public.sport_installation_incidents;
create trigger eps_installation_incident_scope_trigger
  before insert or update on public.sport_installation_incidents
  for each row execute function public.eps_installation_incident_scope();

drop policy if exists eps_installation_incident_owner on public.sport_installation_incidents;
drop policy if exists eps_installation_incident_read on public.sport_installation_incidents;
drop policy if exists eps_installation_incident_create on public.sport_installation_incidents;
drop policy if exists eps_installation_incident_manage on public.sport_installation_incidents;
create policy eps_installation_incident_read on public.sport_installation_incidents
  for select to authenticated using
  (institution_id is not null and institution_id = public.eps_installation_scope());
create policy eps_installation_incident_create on public.sport_installation_incidents
  for insert to authenticated with check
  (user_id = auth.uid() and institution_id = public.eps_institution()
   and not exists(select 1 from public.eps_installation_managers m where m.user_id = auth.uid()));
create policy eps_installation_incident_manage on public.sport_installation_incidents
  for update to authenticated using
  (exists(select 1 from public.eps_installation_managers m
    where m.user_id = auth.uid() and m.institution_id = institution_id))
  with check
  (exists(select 1 from public.eps_installation_managers m
    where m.user_id = auth.uid() and m.institution_id = institution_id));

revoke insert, update, delete on public.sport_installation_incidents from authenticated;
grant select, insert on public.sport_installation_incidents to authenticated;
-- Aucun PATCH direct : chaque changement de statut doit passer par la RPC
-- transactionnelle ci-dessous pour conserver sa trace dans les interventions.

create table if not exists public.eps_installation_interventions (
  id uuid primary key default gen_random_uuid(),
  incident_id text not null references public.sport_installation_incidents(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  status text not null check(status in ('EN_COURS','RESOLU')),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists eps_installation_interventions_incident_idx
  on public.eps_installation_interventions(incident_id, created_at);
alter table public.eps_installation_interventions enable row level security;
revoke all on public.eps_installation_interventions from anon, authenticated;
grant select on public.eps_installation_interventions to authenticated;
drop policy if exists eps_installation_interventions_read on public.eps_installation_interventions;
create policy eps_installation_interventions_read on public.eps_installation_interventions
  for select to authenticated using(institution_id = public.eps_installation_scope());

create or replace function public.eps_update_installation_report(
  p_incident_id text, p_status text, p_note text default ''
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  report public.sport_installation_incidents%rowtype;
begin
  select * into report from public.sport_installation_incidents
    where id = p_incident_id and not deleted for update;
  if report.id is null or not exists(select 1 from public.eps_installation_managers m
    where m.user_id = auth.uid() and m.institution_id = report.institution_id)
    or not public.eps_account_active() then
    raise exception 'Signalement inaccessible' using errcode = '42501';
  end if;
  if p_status not in ('EN_COURS','RESOLU') or
    (p_status = 'RESOLU' and report.status <> 'EN_COURS') or
    (p_status = 'EN_COURS' and report.status not in ('SIGNALE','A_ENVOYER')) then
    raise exception 'Transition de statut impossible';
  end if;
  update public.sport_installation_incidents set status = p_status,
    updated_at = now(), resolved_at = case when p_status = 'RESOLU' then now() else null end
    where id = p_incident_id;
  insert into public.eps_installation_interventions
    (incident_id, institution_id, actor_id, status, note)
    values(p_incident_id, report.institution_id, auth.uid(), p_status, left(coalesce(p_note,''), 2000));
  return jsonb_build_object('id', p_incident_id, 'status', p_status);
end;
$$;
revoke all on function public.eps_update_installation_report(text,text,text) from public;
grant execute on function public.eps_update_installation_report(text,text,text) to authenticated;

commit;
